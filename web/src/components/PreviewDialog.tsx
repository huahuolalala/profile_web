import { DownloadSimple, X } from '@phosphor-icons/react';

interface Props {
  html: string;
  filename: string;
  onClose: () => void;
}

/** 导出前预览：iframe 内嵌渲染生成的单文件 HTML，可直接下载 */
export default function PreviewDialog({ html, filename, onClose }: Props) {
  const download = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-bar">
          <h3>预览导出效果</h3>
          <div className="preview-actions">
            <button className="btn-primary btn-icon" onClick={download}>
              <DownloadSimple size={15} weight="bold" /> 下载 HTML
            </button>
            <button className="btn-ghost btn-icon" onClick={onClose}>
              <X size={15} weight="bold" /> 关闭
            </button>
          </div>
        </div>
        <iframe className="preview-frame" srcDoc={html} title="导出预览" />
      </div>
    </div>
  );
}
