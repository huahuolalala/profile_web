import {
  ArrowBendDownRight,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowClockwise,
  Code,
  DownloadSimple,
  FileHtml,
  FloppyDisk,
  Link as LinkIcon,
  Plus,
} from '@phosphor-icons/react';

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
  arrows: boolean;
  onToggleArrows: () => void;
}

const ICON = { size: 15, weight: 'bold' as const };

export default function TopBar(p: Props) {
  return (
    <header className="topbar">
      <button className="btn-ghost btn-icon" onClick={p.onBack}>
        <ArrowLeft {...ICON} /> 列表
      </button>
      <input className="topbar-title" value={p.title} onChange={(e) => p.onTitle(e.target.value)} placeholder="画布标题" />
      <div className="topbar-actions">
        <button className="btn-icon" onClick={p.onAdd}>
          <Plus {...ICON} /> 新建卡片
        </button>
        <button
          className={`btn-icon ${p.connectMode ? 'active' : ''}`}
          onClick={p.onConnect}
          title="进入连线模式：依次点两张卡片生成连线；点已有连线删除；Esc 退出"
        >
          <LinkIcon {...ICON} /> 连线
        </button>
        <button className="btn-icon" disabled={!p.canUndo} onClick={p.onUndo}>
          <ArrowCounterClockwise {...ICON} /> 撤销
        </button>
        <button className="btn-icon" disabled={!p.canRedo} onClick={p.onRedo}>
          <ArrowClockwise {...ICON} /> 重做
        </button>
        <button
          className={`btn-icon ${p.arrows ? 'active' : ''}`}
          onClick={p.onToggleArrows}
          title="切换连线是否带箭头"
        >
          <ArrowBendDownRight {...ICON} /> 箭头
        </button>
        <span className="topbar-sep" />
        <button className="btn-icon" onClick={p.onImport} title="粘贴 AI 生成的 DSL 代码渲染卡片">
          <Code {...ICON} /> 导入代码
        </button>
        <button className="btn-icon" onClick={p.onExportCode} title="把当前画布导出为 DSL 代码">
          <DownloadSimple {...ICON} /> 导出代码
        </button>
        <button className="btn-icon" onClick={p.onExportHTML} title="导出单文件 HTML 简历">
          <FileHtml {...ICON} /> 导出 HTML
        </button>
        <span className="topbar-sep" />
        <button className="btn-primary btn-icon" onClick={p.onSave}>
          <FloppyDisk {...ICON} /> 保存
        </button>
        <span className={`save-state save-${p.saveState}`}>{SAVE_TEXT[p.saveState]}</span>
      </div>
    </header>
  );
}
