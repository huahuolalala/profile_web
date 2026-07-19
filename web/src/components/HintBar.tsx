export default function HintBar() {
  return (
    <footer className="hint-bar">
      <span><kbd>Scroll</kbd> 缩放</span>
      <span><kbd>Shift 拖拽</kbd> 框选</span>
      <span><kbd>双击卡片</kbd> 编辑</span>
      <span><kbd>双击连线</kbd> 删线</span>
      <span><kbd>Del</kbd> 删除选中</span>
      <span><kbd>Ctrl+Z</kbd> 撤销</span>
    </footer>
  );
}
