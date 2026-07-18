import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';
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
      body: { title: name.trim() || '未命名简历' },
    });
    nav(`/resume/${id}`);
  };

  return (
    <div className="home">
      <header className="home-header">
        <h1>我的简历</h1>
        <button className="btn-ghost" onClick={() => { setToken(null); nav('/login'); }}>退出登录</button>
      </header>
      <div className="home-new">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
          placeholder="新简历名称"
        />
        <button className="btn-primary" onClick={() => void create()}>＋ 新建简历</button>
      </div>
      <div className="resume-grid">
        {list.map((r) => (
          <div className="resume-item" key={r.id} onClick={() => nav(`/resume/${r.id}`)}>
            <div className="resume-title">{r.title}</div>
            <div className="resume-time">更新于 {r.updatedAt}</div>
            <div className="resume-ops" onClick={(e) => e.stopPropagation()}>
              <button onClick={async () => {
                const t = window.prompt('重命名简历', r.title);
                if (t) { await api(`/api/resumes/${r.id}`, { method: 'PATCH', body: { title: t } }); await load(); }
              }}>重命名</button>
              <button onClick={async () => {
                if (window.confirm(`删除简历「${r.title}」？不可恢复。`)) {
                  await api(`/api/resumes/${r.id}`, { method: 'DELETE' });
                  await load();
                }
              }}>删除</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="home-empty">还没有简历，先新建一份吧。</p>}
      </div>
    </div>
  );
}
