export default function HintBar() {
  return (
    <footer className="hint-bar">
      <span><kbd>Scroll</kbd> 缩放</span>
      <span><kbd>Drag</kbd> 移动画布</span>
      <span><kbd>双击卡片</kbd> 编辑</span>
      <span><kbd>双击连线</kbd> 删除</span>
      <span><kbd>Ctrl+Z</kbd> 撤销</span>
      <span><kbd>Esc</kbd> 退出</span>
    </footer>
  );
}
