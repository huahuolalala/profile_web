import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowSquareOut, Brain, Plus, SignOut } from '@phosphor-icons/react';
import { api, setToken, formatRelativeTime } from '../api/client';
import type { ResumeSummary } from '../types';

export default function ResumeList() {
  const [list, setList] = useState<ResumeSummary[]>([]);
  const [name, setName] = useState('');
  const nav = useNavigate();

  const load = async () => {
    const r = await api<{ resumes: ResumeSummary[] }>('/api/resumes');
    setList(r.resumes);
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    const { id } = await api<{ id: number }>('/api/resumes', {
      method: 'POST',
      body: { title: name.trim() || '未命名画布' },
    });
    nav(`/mind/${id}`);
  };

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-brand">
          <img src="/logo-192.png" alt="YumMe" className="brand-logo" />
          <h1>我的画布</h1>
        </div>
        <div className="home-header-actions">
          <button className="btn-ghost" onClick={() => nav('/')}>回官网</button>
          <button className="btn-ghost btn-icon" onClick={() => { setToken(null); nav('/'); }}>
            <SignOut size={15} weight="bold" /> 退出登录
          </button>
        </div>
      </header>
      <div className="home-new">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
          placeholder="新画布名称"
        />
        <button className="btn-primary btn-icon" onClick={() => void create()}>
          <Plus size={15} weight="bold" /> 新建画布
        </button>
      </div>
      <div className="resume-grid">
        {list.map((r) => (
          <div className="resume-item" key={r.id} onClick={() => nav(`/mind/${r.id}`)}>
            <div className="resume-strip" />
            <div className="resume-title">{r.title}</div>
            <div className="resume-time">更新于 {formatRelativeTime(r.updatedAt)}</div>
            <div className="resume-ops" onClick={(e) => e.stopPropagation()}>
              <button className="btn-icon" onClick={() => nav(`/mind/${r.id}`)}>
                <ArrowSquareOut size={13} /> 打开
              </button>
              <button onClick={async () => {
                const t = window.prompt('重命名画布', r.title);
                if (t) { await api(`/api/resumes/${r.id}`, { method: 'PATCH', body: { title: t } }); await load(); }
              }}>重命名</button>
              <button onClick={async () => {
                if (window.confirm(`删除画布「${r.title}」？不可恢复。`)) {
                  await api(`/api/resumes/${r.id}`, { method: 'DELETE' });
                  await load();
                }
              }}>删除</button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="home-empty">
            <Brain size={40} weight="duotone" />
            <p>还没有画布，先新建一张吧。</p>
          </div>
        )}
      </div>
    </div>
  );
}
