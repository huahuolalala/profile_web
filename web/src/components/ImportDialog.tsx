import { useState } from 'react';

interface Props {
  onClose: () => void;
  /** 返回 null 表示成功，否则为错误文案 */
  onImport: (text: string, mode: 'append' | 'overwrite') => string | null;
}

export default function ImportDialog({ onClose, onImport }: Props) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'overwrite'>('append');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>导入代码</h3>
        <p className="modal-tip">粘贴 AI 按 AGENTS.md 中 DSL 规范生成的 JSON 代码，校验通过后渲染为画布卡片。</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder='{"version":1,"cards":[{"title":"个人信息","blocks":[...]}],"edges":[...]}'
          autoFocus
        />
        <div className="modal-mode">
          <label><input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} /> 追加到当前画布</label>
          <label><input type="radio" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} /> 覆盖全部卡片</label>
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            onClick={() => {
              const err = onImport(text, mode);
              if (err) setError(err);
              else onClose();
            }}
          >
            导入
          </button>
        </div>
      </div>
    </div>
  );
}
