export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败，将自动重试',
};

interface Props {
  title: string;
  onTitle: (t: string) => void;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  connectMode: boolean;
  onBack: () => void;
  onAdd: () => void;
  onConnect: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onExportCode: () => void;
  onExportHTML: () => void;
  onSave: () => void;
}

export default function TopBar(p: Props) {
  return (
    <header className="topbar">
      <button className="btn-ghost" onClick={p.onBack}>← 列表</button>
      <input className="topbar-title" value={p.title} onChange={(e) => p.onTitle(e.target.value)} placeholder="简历标题" />
      <div className="topbar-actions">
        <button onClick={p.onAdd}>＋ 新建卡片</button>
        <button className={p.connectMode ? 'active' : ''} onClick={p.onConnect} title="进入连线模式：依次点两张卡片生成连线；点已有连线删除；Esc 退出">
          🔗 连线
        </button>
        <button disabled={!p.canUndo} onClick={p.onUndo}>↩ 撤销</button>
        <button disabled={!p.canRedo} onClick={p.onRedo}>↪ 重做</button>
        <span className="topbar-sep" />
        <button onClick={p.onImport} title="粘贴 AI 生成的 DSL 代码渲染卡片">⇥ 导入代码</button>
        <button onClick={p.onExportCode} title="把当前画布导出为 DSL 代码">⇤ 导出代码</button>
        <button onClick={p.onExportHTML} title="导出单文件 HTML 简历">⬇ 导出 HTML</button>
        <span className="topbar-sep" />
        <button className="btn-primary" onClick={p.onSave}>保存</button>
        <span className={`save-state save-${p.saveState}`}>{SAVE_TEXT[p.saveState]}</span>
      </div>
    </header>
  );
}
