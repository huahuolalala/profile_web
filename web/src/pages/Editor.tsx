import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, parseServerTime } from '../api/client';
import CanvasView from '../components/CanvasView';
import CardView from '../components/CardView';
import EdgesLayer from '../components/EdgesLayer';
import HintBar from '../components/HintBar';
import ImportDialog from '../components/ImportDialog';
import LayersPanel from '../components/LayersPanel';
import Minimap from '../components/Minimap';
import TopBar, { type SaveState } from '../components/TopBar';
import { cardsToDSL, dslToCards, parseDSL } from '../editor/dsl';
import { exportHTML } from '../editor/exporter';
import { editorReducer, initEditor, loadLocal, saveLocal, uid, type EditorDoc } from '../editor/store';
import { toWorld, zoomAt, type Viewport } from '../editor/transform';
import { canRedo, canUndo } from '../editor/undostack';
import type { Card, Resume } from '../types';

const EMPTY: EditorDoc = { title: '', cards: [], edges: [] };

export default function Editor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [state, dispatch] = useReducer(editorReducer, EMPTY, initEditor);
  const doc = state.present;

  const [loaded, setLoaded] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ x: 200, y: 80, z: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null); // null=关闭；''=等源卡片；否则为源卡片 id
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [stageSize, setStageSize] = useState({ w: 1200, h: 800 });
  const [importOpen, setImportOpen] = useState(false);
  const [dslOpen, setDslOpen] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const docRef = useRef(doc);
  docRef.current = doc;

  // 加载：本地缓存与后端取较新者（后端为容灾备份）
  useEffect(() => {
    void (async () => {
      const { resume } = await api<{ resume: Resume }>(`/api/resumes/${id}`);
      const local = loadLocal(id);
      const serverDoc: EditorDoc = { title: resume.title, cards: resume.cards, edges: resume.edges };
      const useLocal = !!local && Date.parse(local.savedAt) > parseServerTime(resume.updatedAt);
      dispatch({ type: 'doc/replace', doc: useLocal ? local.doc : serverDoc });
      setLoaded(true);
    })();
  }, [id]);

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

  // 快捷键：Ctrl/Cmd+Z 撤销，+Shift 重做，Esc 退出编辑/连线/选中
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'history/redo' : 'history/undo' });
      } else if (e.key === 'Escape') {
        setEditingId(null);
        setConnectFrom(null);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const updateCard = (card: Card) => dispatch({ type: 'card/update', card });

  const onCardClick = (cid: string) => {
    if (connectFrom !== null) {
      if (connectFrom === '') setConnectFrom(cid);
      else if (connectFrom !== cid) {
        dispatch({ type: 'edge/add', edge: { id: uid(), fromId: connectFrom, toId: cid } });
        setConnectFrom(null);
      }
      return;
    }
    setSelectedId(cid);
  };

  const jumpTo = (wx: number, wy: number) => {
    setViewport((v) => ({ ...v, x: stageSize.w / 2 - wx * v.z, y: stageSize.h / 2 - wy * v.z }));
  };

  const zoomBy = (f: number) => setViewport((v) => zoomAt(v, stageSize.w / 2, stageSize.h / 2, f));

  const addCard = () => {
    const c = toWorld(viewport, stageSize.w / 2, stageSize.h / 2);
    const card: Card = {
      id: uid(), title: '新卡片', theme: 'white',
      x: c.x - 130, y: c.y - 100, w: 260, visible: true,
      blocks: [{ type: 'text', text: '双击编辑内容' }],
    };
    dispatch({ type: 'card/add', card });
    setSelectedId(card.id);
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

  const onExportHTML = () => {
    const blob = new Blob([exportHTML(doc.title, doc.cards)], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.title || '简历'}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!loaded) return <div className="loading">加载中…</div>;

  return (
    <div className="editor-root">
      <TopBar
        title={doc.title}
        onTitle={(t) => dispatch({ type: 'title/set', title: t })}
        saveState={saveState}
        canUndo={canUndo(state)}
        canRedo={canRedo(state)}
        connectMode={connectFrom !== null}
        onBack={() => nav('/')}
        onAdd={addCard}
        onConnect={() => setConnectFrom(connectFrom === null ? '' : null)}
        onUndo={() => dispatch({ type: 'history/undo' })}
        onRedo={() => dispatch({ type: 'history/redo' })}
        onImport={() => setImportOpen(true)}
        onExportCode={() => setDslOpen(true)}
        onExportHTML={onExportHTML}
        onSave={() => void syncNow()}
      />
      <div className="editor-main">
        <LayersPanel
          cards={doc.cards}
          selectedId={selectedId}
          onJump={(cid) => {
            const c = doc.cards.find((x) => x.id === cid);
            if (c) { jumpTo(c.x + c.w / 2, c.y + 100); setSelectedId(cid); }
          }}
          onAdd={addCard}
          onRename={(cid, t) => { const c = doc.cards.find((x) => x.id === cid); if (c) updateCard({ ...c, title: t }); }}
          onToggle={(cid) => { const c = doc.cards.find((x) => x.id === cid); if (c) updateCard({ ...c, visible: !c.visible }); }}
          onDelete={(cid) => { dispatch({ type: 'card/delete', id: cid }); if (selectedId === cid) setSelectedId(null); }}
        />
        <div className="stage" ref={stageRef}>
          <CanvasView
            viewport={viewport}
            onViewport={setViewport}
            onBackgroundClick={() => { setSelectedId(null); setEditingId(null); }}
          >
            <EdgesLayer
              cards={doc.cards} edges={doc.edges} heights={heights} dragPos={dragPos}
              connectMode={connectFrom !== null}
              onEdgeClick={(eid) => dispatch({ type: 'edge/delete', id: eid })}
            />
            {doc.cards.map((c) => (
              <CardView
                key={c.id} card={c} z={viewport.z}
                selected={c.id === selectedId}
                editing={c.id === editingId}
                connectMode={connectFrom !== null}
                onClick={onCardClick}
                onEdit={(cid) => { if (connectFrom === null) setEditingId(cid); }}
                onDrag={(cid, x, y) => setDragPos((m) => ({ ...m, [cid]: { x, y } }))}
                onMoveEnd={(cid, x, y) => {
                  setDragPos((m) => { const n = { ...m }; delete n[cid]; return n; });
                  dispatch({ type: 'card/move', id: cid, x, y });
                }}
                onMeasure={(cid, h) => setHeights((m) => (m[cid] === h ? m : { ...m, [cid]: h }))}
                onUpdate={updateCard}
                onCloseEdit={() => setEditingId(null)}
              />
            ))}
          </CanvasView>
          <Minimap cards={doc.cards} heights={heights} viewport={viewport} stageW={stageSize.w} stageH={stageSize.h} onJump={jumpTo} />
          <div className="zoom-bar">
            <button onClick={() => zoomBy(1 / 1.2)}>−</button>
            <span>{Math.round(viewport.z * 100)}%</span>
            <button onClick={() => zoomBy(1.2)}>＋</button>
            <button title="复位视图" onClick={() => setViewport({ x: 200, y: 80, z: 1 })}>⤢</button>
          </div>
          <HintBar />
        </div>
      </div>
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={onImport} />}
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
