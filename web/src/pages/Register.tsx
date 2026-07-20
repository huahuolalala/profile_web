import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CircleNotch } from '@phosphor-icons/react';
import { api, setToken } from '../api/client';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const { token } = await api<{ token: string }>('/api/register', {
        method: 'POST',
        body: { username, password },
      });
      setToken(token);
      // 新用户直接进入「我的画布」，第一时间看到赠送的 YumMe Example
      nav('/mind');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={(e) => { e.preventDefault(); if (!busy) void submit(); }}>
        <div className="brand-mark-img"><img src="/logo-192.png" alt="YumMe" /></div>
        <h1>加入 YumMe</h1>
        <p className="auth-sub">注册即送 YumMe Example 样例画布，照着改就是你的</p>
        <label className="field">
          <span className="field-label">用户名</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="请输入用户名" autoFocus />
        </label>
        <label className="field">
          <span className="field-label">密码</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? <CircleNotch className="spin" size={16} weight="bold" /> : '注册并登录'}
        </button>
        <p className="auth-link">已有账号？<Link to="/login">登录</Link></p>
      </form>
    </div>
  );
}
