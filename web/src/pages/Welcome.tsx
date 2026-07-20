import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowsOutCardinal,
  Code,
  FilePdf,
  MagicWand,
  MouseSimple,
  Sparkle,
} from '@phosphor-icons/react';
import { getToken } from '../api/client';

const FEATURES = [
  {
    icon: MouseSimple,
    title: '直接编辑成品',
    body: '添加、改写和拖动都发生在最终页面上。',
  },
  {
    icon: ArrowsOutCardinal,
    title: '自由调整尺寸',
    body: '横向、纵向和等比例缩放都保留清晰节奏。',
  },
  {
    icon: MagicWand,
    title: '一键排版',
    body: '根据类型和内容重新选择宽度与阅读顺序。',
  },
  {
    icon: FilePdf,
    title: '连续长页 PDF',
    body: '直接下载，不跳转，不打开额外预览页。',
  },
];

export default function Welcome() {
  const nav = useNavigate();
  const loggedIn = !!getToken();

  return (
    <div className="welcome">
      <nav className="welcome-nav">
        <Link to="/" className="welcome-brand" aria-label="YumMe 首页">
          <img src="/logo-192.png" alt="" className="brand-logo" />
          <span className="brand-word">Yum<span className="brand-word-accent">Me</span></span>
        </Link>
        <div className="welcome-nav-actions">
          <a href="#features" className="welcome-nav-link">功能</a>
          {loggedIn ? (
            <button className="btn-primary btn-icon" onClick={() => nav('/mind')}>
              打开手账 <ArrowRight size={15} weight="bold" />
            </button>
          ) : (
            <>
              <Link to="/login" className="btn-ghost btn-as-link">登录</Link>
              <Link to="/register" className="btn-primary btn-as-link">开始制作</Link>
            </>
          )}
        </div>
      </nav>

      <main>
        <section className="welcome-hero">
          <div className="hero-copy">
            <div className="hero-product"><Sparkle size={15} weight="fill" /> YumMe 数字手账</div>
            <h1>把内容，排成一本真正好看的手账。</h1>
            <p className="hero-sub">
              拖动、缩放、改写，页面本身就是成品。一键排版后直接下载连续长页 PDF。
            </p>
            <div className="hero-cta">
              <Link to={loggedIn ? '/mind' : '/register'} className="btn-primary btn-lg btn-as-link">
                {loggedIn ? '继续制作' : '创建第一本'} <ArrowRight size={17} weight="bold" />
              </Link>
              {!loggedIn && <Link to="/login" className="btn-lg btn-as-link btn-secondary">登录</Link>}
            </div>
          </div>

          <div className="hero-showcase">
            <div className="showcase-frame">
              <img
                src="/yumme-journal-showcase.png"
                alt="YumMe 编辑器中的林晚晴作品集手账页面"
              />
            </div>
            <div className="showcase-caption">
              <div>
                <strong>所见即所得</strong>
                <span>编辑区就是最终成品</span>
              </div>
              <div>
                <strong>两套视觉</strong>
                <span>手账风与纯白简约</span>
              </div>
            </div>
          </div>
        </section>

        <section className="welcome-feature-band" id="features">
          <div className="feature-heading">
            <h2>每一个动作，都在帮你完成这本手账</h2>
            <p>没有连线，也没有单独预览。内容、尺寸和排版始终在同一页里。</p>
          </div>
          <div className="feature-rail">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article className="feature-item" key={title}>
                <Icon size={24} weight="duotone" />
                <strong>{title}</strong>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="welcome-types">
          <div className="types-copy">
            <h2>七种内容，不是同一张卡片换颜色</h2>
            <p>正文、便签、引言、链接、数据、清单和时间线，各自使用适合内容的结构与密度。</p>
          </div>
          <div className="types-board" aria-label="七种手账素材示意">
            <article className="type-sample type-sample-standard">
              <span>正文</span>
              <strong>一个主题，一段完整叙事</strong>
              <p>标题、正文、标签与图片可以自由组合。</p>
            </article>
            <article className="type-sample type-sample-quote">
              <span>引言</span>
              <blockquote>先把问题讲清楚，再把界面做漂亮。</blockquote>
              <small>林晚晴 / 设计原则</small>
            </article>
            <article className="type-sample type-sample-stat">
              <span>数据</span>
              <strong>7 年</strong>
              <p>产品设计经验</p>
            </article>
            <article className="type-sample type-sample-note">
              <span>便签</span>
              <p>开放一个合作档期，远程优先。</p>
            </article>
            <article className="type-sample type-sample-todo">
              <span>清单</span>
              <p><i className="sample-check checked" />整理访谈提纲</p>
              <p><i className="sample-check" />完成关键流程原型</p>
            </article>
            <article className="type-sample type-sample-timeline">
              <span>时间线</span>
              <p><b>2026</b> 独立产品设计师</p>
              <p><b>2023</b> 复杂工作流与设计系统</p>
            </article>
            <article className="type-sample type-sample-link">
              <span>链接</span>
              <strong>完整作品集</strong>
              <small>linwanqing.design</small>
            </article>
          </div>
        </section>

        <section className="welcome-ai">
          <div className="ai-mark"><Code size={26} weight="duotone" /></div>
          <div>
            <h2>也可以让 AI 先帮你备好整页素材</h2>
            <p>导入 DSL 后继续在页面上拖动、缩放和改写，所有内容仍由你掌控。</p>
          </div>
          <Link to={loggedIn ? '/mind' : '/register'} className="btn-lg btn-as-link btn-secondary">
            打开制作台 <ArrowRight size={16} weight="bold" />
          </Link>
        </section>
      </main>

      <footer className="welcome-footer">
        <div className="welcome-brand">
          <img src="/logo-192.png" alt="" className="brand-logo sm" />
          <span className="brand-word">Yum<span className="brand-word-accent">Me</span></span>
        </div>
        <p className="footer-tag">把值得留下的内容，认真排成一页。</p>
      </footer>
    </div>
  );
}
