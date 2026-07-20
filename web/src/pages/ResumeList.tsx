import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenText,
  PencilSimple,
  Plus,
  SignOut,
  Trash,
} from '@phosphor-icons/react';
import { api, setToken, formatRelativeTime } from '../api/client';
import type { ResumeSummary } from '../types';

export default function ResumeList() {
  const [list, setList] = useState<ResumeSummary[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const nav = useNavigate();

  const load = async () => {
    setError('');
    try {
      const r = await api<{ resumes: ResumeSummary[] }>('/api/resumes');
      setList(r.resumes);
    } catch {
      setError('手账列表加载失败，请刷新重试。');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    const { id } = await api<{ id: number }>('/api/resumes', {
      method: 'POST',
      body: { title: name.trim() || '未命名手账' },
    });
    nav(`/mind/${id}`);
  };

  const saveRename = async (resume: ResumeSummary) => {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title || title === resume.title) return;
    await api(`/api/resumes/${resume.id}`, { method: 'PATCH', body: { title } });
    await load();
  };

  return (
    <div className="home">
      <header className="home-header">
        <button className="home-brand" onClick={() => nav('/')} aria-label="返回 YumMe 首页">
          <img src="/logo-192.png" alt="" className="brand-logo" />
          <div>
            <span>YumMe</span>
            <strong>数字手账</strong>
          </div>
        </button>
        <div className="home-header-actions">
          <button className="btn-ghost" onClick={() => nav('/')}>返回首页</button>
          <button className="btn-ghost btn-icon" onClick={() => { setToken(null); nav('/'); }}>
            <SignOut size={15} weight="bold" /> 退出登录
          </button>
        </div>
      </header>

      <main className="home-main">
        <section className="home-intro">
          <div className="home-intro-copy">
            <span>我的手账</span>
            <h1>继续整理，或者开始一本新的。</h1>
            <p>{loading ? '正在读取你的作品' : `${list.length} 本手账，修改会自动保存。`}</p>
          </div>
        </section>

        <section className="library-section" aria-busy={loading}>
          <div className="library-heading">
            <h2>全部手账</h2>
            {!loading && <span>{list.length} 本</span>}
          </div>

          {error && (
            <div className="library-error">
              <span>{error}</span>
              <button onClick={() => { setLoading(true); void load(); }}>重新加载</button>
            </div>
          )}

          <div className="resume-grid">
            <form className="home-new" onSubmit={(event) => { event.preventDefault(); void create(); }}>
              <div className="home-new-heading">
                <div>
                  <strong>新建手账</strong>
                  <span>从完整样例开始，进入后直接改写。</span>
                </div>
              </div>
              <div className="home-new-mark" aria-hidden="true">
                <Plus size={48} weight="light" />
              </div>
              <label htmlFor="new-journal-title">手账名称</label>
              <input
                id="new-journal-title"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：夏日旅行记录"
              />
              <button className="btn-primary btn-icon" type="submit">
                创建并打开 <ArrowRight size={16} weight="bold" />
              </button>
            </form>

            {loading && Array.from({ length: 3 }, (_, index) => (
              <div className="resume-item resume-skeleton" key={index}>
                <div className="resume-cover" />
                <div className="resume-skeleton-line" />
              </div>
            ))}

            {!loading && list.map((resume, index) => (
              <article className="resume-item" key={resume.id}>
                <button className="resume-open" onClick={() => nav(`/mind/${resume.id}`)}>
                  <div className={`resume-cover resume-cover-${resume.id % 4}`}>
                    <div className="resume-cover-spine" />
                    <div className="resume-cover-meta">
                      <BookOpenText size={18} weight="duotone" />
                      <span>更新于 {formatRelativeTime(resume.updatedAt)}</span>
                    </div>
                    <div className="resume-cover-collage" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <strong>{resume.title}</strong>
                    <small>{String(index + 1).padStart(2, '0')}</small>
                  </div>
                </button>

                <div className="resume-meta">
                  <div className="resume-meta-copy">
                    {editingId === resume.id ? (
                      <input
                        className="resume-rename-input"
                        autoFocus
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onBlur={() => void saveRename(resume)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                        aria-label="手账名称"
                      />
                    ) : (
                      <>
                        <strong>{resume.title}</strong>
                        <span>更新于 {formatRelativeTime(resume.updatedAt)}</span>
                      </>
                    )}
                  </div>
                  <button className="resume-enter" onClick={() => nav(`/mind/${resume.id}`)} aria-label={`打开${resume.title}`}>
                    <ArrowRight size={17} weight="bold" />
                  </button>
                </div>

                <div className="resume-ops">
                  <button
                    title="重命名"
                    aria-label="重命名"
                    onClick={() => {
                      setEditingId(resume.id);
                      setEditingTitle(resume.title);
                    }}
                  >
                    <PencilSimple size={15} />
                  </button>
                  <button
                    className="danger"
                    title="删除"
                    aria-label="删除"
                    onClick={async () => {
                      await api(`/api/resumes/${resume.id}`, { method: 'DELETE' });
                      await load();
                    }}
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </article>
            ))}

            {!loading && list.length === 0 && !error && (
              <div className="home-empty">
                <BookOpenText size={40} weight="duotone" />
                <strong>这里会放你的第一本手账</strong>
                <p>先在上方起一个名字，进入后可以直接改写完整样例。</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
