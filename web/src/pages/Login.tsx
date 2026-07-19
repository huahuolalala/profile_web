import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CircleNotch } from '@phosphor-icons/react';
import { api, setToken } from '../api/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const { token } = await api<{ token: string }>('/api/login', {
        method: 'POST',
        body: { username, password },
      });
      setToken(token);
      nav('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={(e) => { e.preventDefault(); if (!busy) void submit(); }}>
        <div className="brand-mark-img"><img src="/logo-192.png" alt="YumMe" /></div>
        <h1>YumMe</h1>
        <p className="auth-sub">欢迎回来，继续摆你的画布</p>
        <label className="field">
          <span className="field-label">用户名</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="请输入用户名" autoFocus />
        </label>
        <label className="field">
          <span className="field-label">密码</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? <CircleNotch className="spin" size={16} weight="bold" /> : '登录'}
        </button>
        <p className="auth-link">没有账号？<Link to="/register">注册</Link></p>
      </form>
    </div>
  );
}
