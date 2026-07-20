import { useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowClockwise,
  Article,
  ChartLineUp,
  Code,
  DownloadSimple,
  FilePdf,
  FloppyDisk,
  GithubLogo,
  Link as LinkIcon,
  ListChecks,
  Note,
  Notebook,
  Plus,
  Quotes,
} from '@phosphor-icons/react';
import { CARD_TYPE_LABEL, CARD_TYPES, type CardType, type JournalStyle } from '../types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_TEXT: Record<SaveState, string> = {
  idle: '本地已同步',
  saving: '保存中',
  saved: '已保存',
  error: '保存失败',
};

const TYPE_ICON: Record<CardType, React.ReactNode> = {
  standard: <Article size={17} />,
  note: <Note size={17} />,
  quote: <Quotes size={17} />,
  link: <LinkIcon size={17} />,
  stat: <ChartLineUp size={17} />,
  todo: <ListChecks size={17} />,
};

const TYPE_DESCRIPTION: Record<CardType, string> = {
  standard: '正文与图文分区',
  note: '随手贴下灵感',
  quote: '突出一句话',
  link: '收藏网页与作品',
  stat: '强调一个数字',
  todo: '可勾选的清单',
};

interface Props {
  title: string;
  style: JournalStyle;
  onTitle: (title: string) => void;
  onStyle: (style: JournalStyle) => void;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onAdd: (type: CardType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onExportCode: () => void;
  onExportPDF: () => void;
  onSave: () => void;
}

const ICON = { size: 17, weight: 'bold' as const };

export default function TopBar(props: Props) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <header className="studio-topbar">
      <div className="studio-topbar-left">
        <button className="studio-icon-button" onClick={props.onBack} title="返回我的手账">
          <ArrowLeft {...ICON} />
        </button>
        <div className="studio-title-wrap">
          <span>YumMe 手账</span>
          <input
            className="studio-title-input"
            value={props.title}
            onChange={(event) => props.onTitle(event.target.value)}
            placeholder="给这本手账起个名字"
          />
        </div>
      </div>

      <div className="studio-topbar-actions">
        <div className="add-menu-wrap">
          <button className="studio-add-button" onClick={() => setAddOpen((open) => !open)}>
            <Plus {...ICON} /> 添加素材
          </button>
          {addOpen && (
            <>
              <div className="add-menu-mask" onClick={() => setAddOpen(false)} />
              <div className="studio-add-menu">
                {CARD_TYPES.map((type) => (
                  <button
                    key={type}
                    className="studio-add-menu-item"
                    onClick={() => {
                      setAddOpen(false);
                      props.onAdd(type);
                    }}
                  >
                    <span className={`studio-type-icon type-icon-${type}`}>{TYPE_ICON[type]}</span>
                    <span>
                      <strong>{CARD_TYPE_LABEL[type]}</strong>
                      <small>{TYPE_DESCRIPTION[type]}</small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <span className="studio-action-divider" />
        <div className="studio-style-switch" aria-label="整本风格">
          <button
            className={props.style === 'journal' ? 'active' : ''}
            onClick={() => props.onStyle('journal')}
            title="手账风"
          >
            <Notebook size={15} weight="bold" />
            <span>手账</span>
          </button>
          <button
            className={props.style === 'minimal' ? 'active' : ''}
            onClick={() => props.onStyle('minimal')}
            title="纯白简约"
          >
            <GithubLogo size={15} weight="bold" />
            <span>纯白</span>
          </button>
        </div>
        <button className="studio-icon-button studio-history-button" disabled={!props.canUndo} onClick={props.onUndo} title="撤销">
          <ArrowCounterClockwise {...ICON} />
        </button>
        <button className="studio-icon-button studio-history-button" disabled={!props.canRedo} onClick={props.onRedo} title="重做">
          <ArrowClockwise {...ICON} />
        </button>
        <button className="studio-action-button studio-action-compact" onClick={props.onImport} title="导入 AI 生成的 DSL">
          <Code {...ICON} /> 导入
        </button>
        <button className="studio-icon-button studio-code-button" onClick={props.onExportCode} title="导出 DSL 代码">
          <DownloadSimple {...ICON} />
        </button>
        <button className="studio-action-button studio-export-button" onClick={props.onExportPDF}>
          <FilePdf {...ICON} /> 导出 PDF
        </button>
        <button className="studio-save-button" onClick={props.onSave}>
          <FloppyDisk {...ICON} /> 保存
        </button>
        <span className={`studio-save-state save-${props.saveState}`}>{SAVE_TEXT[props.saveState]}</span>
      </div>
    </header>
  );
}
