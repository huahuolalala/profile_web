import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Cards, Export, Sparkle, UserCircle } from '@phosphor-icons/react';
import { getToken } from '../api/client';

const USE_CASES = ['个人简历', '自我介绍', '项目说明书', '作品集', '读书笔记', '灵感地图', '年度总结', '演讲提纲'];

const STEPS = [
  {
    icon: <Cards size={22} weight="duotone" />,
    title: '倒出想法',
    body: '文字、清单、标签、图片，想到什么就先摆上画布，不用管顺序。',
  },
  {
    icon: <Sparkle size={22} weight="duotone" />,
    title: '摆一摆，连一连',
    body: '拖动卡片找到最好的布局，用手绘蜡笔连线串起它们的关系。',
  },
  {
    icon: <Export size={22} weight="duotone" />,
    title: '长成任何样子',
    body: '一键导出精美的 HTML 页面，或者让 AI 读懂画布替你接着创作。',
  },
];

export default function Welcome() {
  const nav = useNavigate();
  const loggedIn = !!getToken();

  return (
    <div className="welcome">
      <nav className="welcome-nav">
        <div className="welcome-brand">
          <img src="/logo-192.png" alt="YumMe" className="brand-logo" />
          <span className="brand-word">Yum<span className="brand-word-accent">Me</span></span>
        </div>
        <div className="welcome-nav-actions">
          {loggedIn ? (
            <button className="btn-primary btn-icon" onClick={() => nav('/mind')}>
              Enter your mind! <ArrowRight size={15} weight="bold" />
            </button>
          ) : (
            <>
              <Link to="/login" className="btn-ghost btn-as-link">登录</Link>
              <Link to="/register" className="btn-primary btn-as-link">注册</Link>
            </>
          )}
        </div>
      </nav>

      <header className="welcome-hero">
        <div className="hero-copy">
          <h1>把脑海里的样子，<br />摆出来。</h1>
          <p className="hero-sub">
            YumMe 是一张属于你的思维画布。把想法、经历与作品倒出来，
            摆一摆、连一连，长成你想展示的任何样子。
          </p>
          <div className="hero-cta">
            {loggedIn ? (
              <button className="btn-primary btn-lg btn-icon" onClick={() => nav('/mind')}>
                Enter your mind! <ArrowRight size={17} weight="bold" />
              </button>
            ) : (
              <>
                <Link to="/register" className="btn-primary btn-lg btn-as-link">
                  Enter your mind! <ArrowRight size={17} weight="bold" />
                </Link>
                <Link to="/login" className="btn-lg btn-as-link btn-secondary">已有账号</Link>
              </>
            )}
          </div>
          <p className="hero-note">注册即送 YumMe Example 样例画布，照着改就是你的。</p>
        </div>
        <div className="hero-art">
          <img src="/logo.png" alt="YumMe 小团子" className="hero-mascot" />
        </div>
      </header>

      <section className="welcome-steps">
        <h2>三步，把脑子倒空</h2>
        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <div className={`step-card step-${i}`} key={s.title}>
              <div className="step-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="welcome-cases">
        <h2>一张画布，不止一种长法</h2>
        <p className="cases-sub">简历只是开始。你的画布可以长成任何你想展示的样子。</p>
        <div className="cases-pills">
          {USE_CASES.map((c) => (
            <span className="case-pill" key={c}>{c}</span>
          ))}
        </div>
      </section>

      <section className="welcome-ai">
        <div className="ai-inner">
          <UserCircle size={40} weight="duotone" className="ai-icon" />
          <h2>说给 AI 听，它替你铺好画布</h2>
          <p>
            YumMe 是 AI Native 的：把你的经历告诉任意 AI，它会按 DSL 规范生成一整张画布。
            粘贴、导入、成型，画布也能随时导出成代码交给 AI 继续改。
          </p>
          <Link to={loggedIn ? '/mind' : '/register'} className="btn-lg btn-as-link btn-secondary">
            试试看 <ArrowRight size={16} weight="bold" />
          </Link>
        </div>
      </section>

      <footer className="welcome-footer">
        <div className="welcome-brand">
          <img src="/logo-192.png" alt="YumMe" className="brand-logo sm" />
          <span className="brand-word">Yum<span className="brand-word-accent">Me</span></span>
        </div>
        <p className="footer-tag">Explore · Create · Connect · Grow</p>
      </footer>
    </div>
  );
}
