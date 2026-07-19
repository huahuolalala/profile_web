import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { animate, type AnimationPlaybackControls } from 'motion/react';
import { FrameCorners, Minus, Plus } from '@phosphor-icons/react';
import { api, parseServerTime } from '../api/client';
import CanvasView from '../components/CanvasView';
import CardView from '../components/CardView';
import EdgesLayer from '../components/EdgesLayer';
import HintBar from '../components/HintBar';
import ImportDialog from '../components/ImportDialog';
import LayersPanel from '../components/LayersPanel';
import Minimap from '../components/Minimap';
import PreviewDialog from '../components/PreviewDialog';
import TopBar, { type SaveState } from '../components/TopBar';
import { cardsToDSL, dslToCards, parseDSL } from '../editor/dsl';
import { exportHTML } from '../editor/exporter';
import { editorReducer, initEditor, loadLocal, saveLocal, uid, type EditorDoc } from '../editor/store';
import { marqueeHits } from '../editor/selection';
import { toWorld, zoomAt, type Viewport } from '../editor/transform';
import { canRedo, canUndo } from '../editor/undostack';
import type { Block, Card, CardType, Resume } from '../types';

const EMPTY: EditorDoc = { title: '', cards: [], edges: [] };
const HOME_VIEW: Viewport = { x: 200, y: 80, z: 1 };

/** 各类型新卡片的默认标题与内容 */
const CARD_PRESET: Record<CardType, { title: string; blocks: Block[] }> = {
  standard: { title: '新卡片', blocks: [{ type: 'text', text: '双击编辑内容' }] },
  note: { title: '便签', blocks: [{ type: 'text', text: '随手记…' }] },
  quote: { title: '署名', blocks: [{ type: 'text', text: '写一句引言' }] },
  link: { title: '链接标题', blocks: [{ type: 'text', text: 'example.com' }, { type: 'text', text: '一句话描述' }] },
  stat: { title: '指标名', blocks: [{ type: 'text', text: '42%' }, { type: 'text', text: '补充说明' }] },
  todo: { title: '待办清单', blocks: [{ type: 'todo', items: [{ text: '第一件事', done: false }] }] },
};

export default function Editor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [state, dispatch] = useReducer(editorReducer, EMPTY, initEditor);
  const doc = state.present;

  const [loaded, setLoaded] = useState(false);
  const [viewport, setViewport] = useState<Viewport>(HOME_VIEW);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = new Set(selectedIds);
  const primaryId = selectedIds.length === 1 ? selectedIds[0] : null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null); // null=关闭；''=等源卡片；否则为源卡片 id
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [stageSize, setStageSize] = useState({ w: 1200, h: 800 });
  const [importOpen, setImportOpen] = useState(false);
  const [dslOpen, setDslOpen] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [newEdgeId, setNewEdgeId] = useState<string | null>(null);
  // hover 某条连线时高亮其两端卡片
  const [edgeEnds, setEdgeEnds] = useState<[string, string] | null>(null);
  const onEdgeHover = (eid: string | null) => {
    if (!eid) { setEdgeEnds(null); return; }
    const e = doc.edges.find((x) => x.id === eid);
    if (e) setEdgeEnds([e.fromId, e.toId]);
  };
  // 连线箭头开关（持久化到 localStorage）
  const [showArrows, setShowArrows] = useState(() => localStorage.getItem('pw_arrows') !== '0');
  const toggleArrows = () => {
    setShowArrows((v) => {
      localStorage.setItem('pw_arrows', v ? '0' : '1');
      return !v;
    });
  };

  const stageRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const docRef = useRef(doc);
  docRef.current = doc;
  // 供无依赖的键盘监听读取最新选中/编辑态
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const editingRef = useRef(editingId);
  editingRef.current = editingId;
  const heightsRef = useRef(heights);
  heightsRef.current = heights;

  // 视口弹簧动画（iOS/macOS 手感）：手动交互（滚轮/拖拽）直接驱动，程序化跳转走弹簧
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const animRef = useRef<AnimationPlaybackControls | null>(null);

  const stopViewportAnim = () => {
    animRef.current?.stop();
    animRef.current = null;
  };

  const animateViewport = useCallback((target: Viewport) => {
    stopViewportAnim();
    const from = viewportRef.current;
    animRef.current = animate(0, 1, {
      type: 'spring',
      stiffness: 280,
      damping: 34,
      mass: 0.9,
      onUpdate: (t) => {
        setViewport({
          x: from.x + (target.x - from.x) * t,
          y: from.y + (target.y - from.y) * t,
          z: from.z + (target.z - from.z) * t,
        });
      },
    });
  }, []);

  // 用户手动操作时立即打断动画，拿回控制权
  const onViewportManual = useCallback((v: Viewport) => {
    stopViewportAnim();
    setViewport(v);
  }, []);

  useEffect(() => () => stopViewportAnim(), []);

  // 加载：本地缓存与后端取较新者（后端为容灾备份）
  useEffect(() => {
    void (async () => {
      try {
        const { resume } = await api<{ resume: Resume }>(`/api/resumes/${id}`);
        const local = loadLocal(id);
        const serverDoc: EditorDoc = { title: resume.title, cards: resume.cards, edges: resume.edges };
        const useLocal = !!local && Date.parse(local.savedAt) > parseServerTime(resume.updatedAt);
        // doc/load：重置历史，加载不应成为可撤销的一步
        dispatch({ type: 'doc/load', doc: useLocal ? local.doc : serverDoc });
        setLoaded(true);
      } catch (e) {
        alert('画布加载失败：' + (e as Error).message);
        nav('/mind');
      }
    })();
  }, [id, nav]);

  // 本地缓存：每次变更立即写
  useEffect(() => {
    if (!loaded) return;
    saveLocal(id, doc);
    dirtyRef.current = true;
  }, [doc, loaded, id]);

  // 手动 + 30 秒无感自动同步
  const syncNow = useCallback(async () => {
    setSaveState('saving');
    try {
      await api(`/api/resumes/${id}`, { method: 'PUT', body: docRef.current });
      dirtyRef.current = false;
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [id]);

  useEffect(() => {
    if (!loaded) return;
    const t = setInterval(() => {
      if (dirtyRef.current) void syncNow();
    }, 30000);
    return () => clearInterval(t);
  }, [loaded, syncNow]);

  // 舞台尺寸（供缩放中心/小地图使用）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  // 快捷键：Ctrl/Cmd+Z 撤销，+Shift 重做，Delete 删选中，Esc 退出编辑/连线/选中
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'history/redo' : 'history/undo' });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.length > 0 && editingRef.current === null) {
        e.preventDefault();
        const ids = selectedIdsRef.current;
        if (ids.length === 1) dispatch({ type: 'card/delete', id: ids[0] });
        else dispatch({ type: 'cards/deleteMany', ids });
        setSelectedIds([]);
      } else if (e.key === 'Escape') {
        setEditingId(null);
        setConnectFrom(null);
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const updateCard = (card: Card) => dispatch({ type: 'card/update', card });

  const onCardClick = (cid: string, additive = false) => {
    if (connectFrom !== null) {
      if (connectFrom === '') setConnectFrom(cid);
      else if (connectFrom !== cid) {
        const edge = { id: uid(), fromId: connectFrom, toId: cid };
        dispatch({ type: 'edge/add', edge });
        setConnectFrom(null);
        // 新连线画线动画（一次性，播完即清除标记）
        setNewEdgeId(edge.id);
        setTimeout(() => setNewEdgeId(null), 800);
      }
      return;
    }
    if (additive) {
      // Shift/Cmd+点击：切换该卡片是否在选区内
      setSelectedIds((ids) => (ids.includes(cid) ? ids.filter((x) => x !== cid) : [...ids, cid]));
    } else if (!selectedSet.has(cid)) {
      // 点击选区外的卡片：单选它；点击已在选区内的卡片不清空多选（便于整体拖拽）
      setSelectedIds([cid]);
    }
  };

  const jumpTo = (wx: number, wy: number) => {
    const v = viewportRef.current;
    animateViewport({ ...v, x: stageSize.w / 2 - wx * v.z, y: stageSize.h / 2 - wy * v.z });
  };

  const zoomBy = (f: number) => animateViewport(zoomAt(viewportRef.current, stageSize.w / 2, stageSize.h / 2, f));

  const addCard = (type: CardType) => {
    const c = toWorld(viewport, stageSize.w / 2, stageSize.h / 2);
    const preset = CARD_PRESET[type];
    const card: Card = {
      id: uid(), title: preset.title, type, theme: 'white',
      x: c.x - 130, y: c.y - 100, w: 260, visible: true,
      blocks: preset.blocks,
    };
    dispatch({ type: 'card/add', card });
    setSelectedIds([card.id]);
    setEditingId(card.id);
  };

  const onImport = (text: string, mode: 'append' | 'overwrite'): string | null => {
    const r = parseDSL(text);
    if (!r.ok) return r.error;
    const base = mode === 'append' ? doc : EMPTY;
    const { cards, edges } = dslToCards(r.doc, base.cards);
    dispatch({ type: 'doc/replace', doc: { title: doc.title, cards: [...base.cards, ...cards], edges: [...base.edges, ...edges] } });
    return null;
  };

  const onExportHTML = () => setHtmlPreview(exportHTML(doc.title, doc.cards));

  if (!loaded) {
    return (
      <div className="loading-screen">
        <div className="skeleton skeleton-topbar" />
        <div className="loading-body">
          <div className="skeleton skeleton-panel" />
          <div className="loading-stage">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card s2" />
            <div className="skeleton skeleton-card s3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-root">
      <TopBar
        title={doc.title}
        onTitle={(t) => dispatch({ type: 'title/set', title: t })}
        saveState={saveState}
        canUndo={canUndo(state)}
        canRedo={canRedo(state)}
        connectMode={connectFrom !== null}
        onBack={() => nav('/mind')}
        onAdd={addCard}
        onConnect={() => setConnectFrom(connectFrom === null ? '' : null)}
        onUndo={() => dispatch({ type: 'history/undo' })}
        onRedo={() => dispatch({ type: 'history/redo' })}
        onImport={() => setImportOpen(true)}
        onExportCode={() => setDslOpen(true)}
        onExportHTML={onExportHTML}
        onSave={() => void syncNow()}
        arrows={showArrows}
        onToggleArrows={toggleArrows}
      />
      <div className="editor-main">
        <LayersPanel
          cards={doc.cards}
          selectedId={primaryId}
          onJump={(cid) => {
            const c = doc.cards.find((x) => x.id === cid);
            if (c) { jumpTo(c.x + c.w / 2, c.y + 100); setSelectedIds([cid]); }
          }}
          onAdd={() => addCard('standard')}
          onRename={(cid, t) => { const c = doc.cards.find((x) => x.id === cid); if (c) updateCard({ ...c, title: t }); }}
          onToggle={(cid) => { const c = doc.cards.find((x) => x.id === cid); if (c) updateCard({ ...c, visible: !c.visible }); }}
          onDelete={(cid) => { dispatch({ type: 'card/delete', id: cid }); setSelectedIds((ids) => ids.filter((x) => x !== cid)); }}
        />
        <div className="stage" ref={stageRef}>
          <CanvasView
            viewport={viewport}
            onViewport={onViewportManual}
            onBackgroundClick={() => { setSelectedIds([]); setEditingId(null); }}
            onMarquee={(rect) => setSelectedIds(marqueeHits(rect, docRef.current.cards, heightsRef.current))}
            onMarqueeEnd={(rect) => setSelectedIds(marqueeHits(rect, docRef.current.cards, heightsRef.current))}
          >
            <EdgesLayer
              cards={doc.cards} edges={doc.edges} heights={heights} dragPos={dragPos}
              connectMode={connectFrom !== null}
              showArrows={showArrows}
              newEdgeId={newEdgeId}
              onEdgeClick={(eid) => dispatch({ type: 'edge/delete', id: eid })}
              onEdgeHover={onEdgeHover}
            />
            {doc.cards.map((c) => (
              <CardView
                key={c.id} card={c} z={viewport.z}
                selected={selectedSet.has(c.id)}
                livePos={dragPos[c.id]}
                editing={c.id === editingId}
                connectMode={connectFrom !== null}
                showToolbar={c.id === primaryId}
                linked={!!edgeEnds && (edgeEnds[0] === c.id || edgeEnds[1] === c.id)}
                onClick={onCardClick}
                onEdit={(cid) => { if (connectFrom === null) setEditingId(cid); }}
                onDrag={(cid, x, y) => {
                  // 多选整体拖拽：以被拖卡片相对原位的偏移，同步广播其余选中卡片
                  const ids = selectedIdsRef.current;
                  if (ids.length > 1 && ids.includes(cid)) {
                    const orig = docRef.current.cards.find((k) => k.id === cid);
                    if (!orig) return;
                    const dx = x - orig.x, dy = y - orig.y;
                    setDragPos(() => {
                      const n: Record<string, { x: number; y: number }> = {};
                      for (const k of docRef.current.cards) {
                        if (ids.includes(k.id)) n[k.id] = { x: k.x + dx, y: k.y + dy };
                      }
                      return n;
                    });
                  } else {
                    setDragPos((m) => ({ ...m, [cid]: { x, y } }));
                  }
                }}
                onMoveEnd={(cid, x, y) => {
                  const ids = selectedIdsRef.current;
                  setDragPos({});
                  if (ids.length > 1 && ids.includes(cid)) {
                    const orig = docRef.current.cards.find((k) => k.id === cid);
                    if (!orig) return;
                    const dx = x - orig.x, dy = y - orig.y;
                    const moves = docRef.current.cards
                      .filter((k) => ids.includes(k.id))
                      .map((k) => ({ id: k.id, x: Math.round(k.x + dx), y: Math.round(k.y + dy) }));
                    dispatch({ type: 'cards/moveMany', moves });
                  } else {
                    dispatch({ type: 'card/move', id: cid, x, y });
                  }
                }}
                onMeasure={(cid, h) => setHeights((m) => (m[cid] === h ? m : { ...m, [cid]: h }))}
                onUpdate={updateCard}
                onCloseEdit={() => setEditingId(null)}
                onConnectFrom={(cid) => setConnectFrom(cid)}
                onDelete={(did) => { dispatch({ type: 'card/delete', id: did }); setSelectedIds((ids) => ids.filter((x) => x !== did)); }}
              />
            ))}
          </CanvasView>
          {doc.cards.length === 0 && (
            <div className="empty-guide">
              <img src="/logo-192.png" alt="" />
              <p>画布还是空的，先摆一张卡片吧</p>
              <button className="btn-primary btn-icon" onClick={() => addCard('standard')}>
                <Plus size={15} weight="bold" /> 新建第一张卡片
              </button>
            </div>
          )}
          <div className="canvas-watermark">
            <img src="/logo-192.png" alt="" />
          </div>
          <Minimap cards={doc.cards} heights={heights} viewport={viewport} stageW={stageSize.w} stageH={stageSize.h} onJump={jumpTo} />
          <div className="zoom-bar">
            <button onClick={() => zoomBy(1 / 1.2)} title="缩小"><Minus size={14} weight="bold" /></button>
            <span>{Math.round(viewport.z * 100)}%</span>
            <button onClick={() => zoomBy(1.2)} title="放大"><Plus size={14} weight="bold" /></button>
            <button title="复位视图" onClick={() => animateViewport(HOME_VIEW)}><FrameCorners size={14} weight="bold" /></button>
          </div>
          <HintBar />
        </div>
      </div>
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={onImport} />}
      {htmlPreview !== null && (
        <PreviewDialog
          html={htmlPreview}
          filename={`${doc.title || 'YumMe 画布'}.html`}
          onClose={() => setHtmlPreview(null)}
        />
      )}
      {dslOpen && (
        <div className="modal-mask" onClick={() => setDslOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>导出代码</h3>
            <p className="modal-tip">当前画布的 DSL 代码，可交给 AI 做增量修改后重新导入。</p>
            <textarea readOnly rows={14} value={cardsToDSL(doc.cards, doc.edges)} onFocus={(e) => e.target.select()} />
            <div className="modal-actions">
              <button onClick={() => setDslOpen(false)}>关闭</button>
              <button className="btn-primary" onClick={() => void navigator.clipboard.writeText(cardsToDSL(doc.cards, doc.edges))}>复制</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
