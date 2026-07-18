import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const nav = useNavigate();

  const submit = async () => {
    try {
      const { token } = await api<{ token: string }>('/api/register', {
        method: 'POST',
        body: { username, password },
      });
      setToken(token);
      nav('/');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h1>注册账号</h1>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" autoFocus />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
        {error && <div className="auth-error">{error}</div>}
        <button className="btn-primary" type="submit">注册并登录</button>
        <p className="auth-link">已有账号？<Link to="/login">登录</Link></p>
      </form>
    </div>
  );
}
