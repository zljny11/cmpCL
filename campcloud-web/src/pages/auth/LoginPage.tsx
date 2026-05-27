import { LoadingOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/auth-provider';
import { authApi } from '../../services/api/auth';
import loginIllustration from './assets/1.png';
import radioDynamicLogo from './assets/logo.png';
import './login.less';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loginWithEmailCode } = useAuth();
  const { message } = App.useApp();
  const [mode, setMode] = useState<'password' | 'forgot-password'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [logging, setLogging] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);

  useEffect(() => {
    if (codeCooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCodeCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [codeCooldown]);

  const handleLogin = async () => {
    if (logging) {
      return;
    }

    if (!username.trim() || !password.trim()) {
      if (!username.trim() && !password.trim()) {
        message.warning('请输入用户名和密码');
      } else if (!username.trim()) {
        message.warning('请输入用户名');
      } else {
        message.warning('请输入密码');
      }
      return;
    }

    try {
      setLogging(true);
      await login({
        username: username.trim(),
        password: password.trim(),
      });
      message.success({
        content: '已登录',
        duration: 1.2,
        key: 'login-success',
      });
      navigate('/', { replace: true });
    } catch {
      message.error('登录失败，请检查用户名和密码');
      setLogging(false);
    }
  };

  const handleSendCode = async () => {
    if (sendingCode || codeCooldown > 0) {
      return;
    }

    if (!email.trim()) {
      message.warning('请输入 user_data 中绑定的邮箱');
      return;
    }

    try {
      setSendingCode(true);
      await authApi.requestPasswordResetCode({
        email: email.trim(),
      });
      setCodeCooldown(60);
      message.success('验证码已发送，请检查邮箱');
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || '验证码发送失败';
      const retryAfterMatch = String(errorMessage).match(/(\d+)\s*秒/);
      if (retryAfterMatch) {
        setCodeCooldown(Number(retryAfterMatch[1]));
      }
      message.error(errorMessage);
    } finally {
      setSendingCode(false);
    }
  };

  const handleEmailCodeLogin = async () => {
    if (logging) {
      return;
    }

    if (!email.trim() || !code.trim()) {
      message.warning('请输入邮箱和验证码');
      return;
    }

    if (newPassword.trim() && newPassword.trim().length < 6) {
      message.warning('新密码长度不能少于 6 位');
      return;
    }

    try {
      setLogging(true);
      await loginWithEmailCode({
        email: email.trim(),
        code: code.trim(),
        newPassword: newPassword.trim() || undefined,
      });
      message.success({
        content: newPassword.trim() ? '密码已更新并登录' : '验证码登录成功',
        duration: 1.2,
        key: 'email-login-success',
      });
      navigate('/', { replace: true });
    } catch (error: any) {
      message.error(error?.response?.data?.message || '验证码登录失败');
      setLogging(false);
    }
  };

  return (
    <section className="AICampCloud-login">
      <h1>AICampCloud</h1>
      <div className="container">
        <div className="workinghny-form-grid">
          <div className="main-hotair">
            <div className="content-wthree">
              <img src={radioDynamicLogo} alt="影动医疗" className="AICampCloud-login-logo" />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (mode === 'password') {
                    void handleLogin();
                    return;
                  }
                  void handleEmailCodeLogin();
                }}
              >
                {mode === 'password' ? (
                  <>
                    <input
                      type="text"
                      className="text"
                      placeholder="User Name"
                      required
                      autoFocus
                      autoComplete="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                    <input
                      type="password"
                      className="password"
                      placeholder="User Password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button className="btn" type="submit" disabled={logging}>
                      {logging ? <LoadingOutlined /> : 'Log In'}
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="email"
                      className="text"
                      placeholder="绑定邮箱"
                      required
                      autoFocus
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                    <div className="AICampCloud-login-code-row">
                      <input
                        type="text"
                        className="text"
                        placeholder="邮箱验证码"
                        required
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                      />
                      <button
                        className="btn secondary"
                        type="button"
                        disabled={sendingCode || codeCooldown > 0}
                        onClick={() => {
                          void handleSendCode();
                        }}
                      >
                        {sendingCode ? (
                          <LoadingOutlined />
                        ) : codeCooldown > 0 ? (
                          `${codeCooldown}s后重试`
                        ) : (
                          '发送验证码'
                        )}
                      </button>
                    </div>
                    <input
                      type="password"
                      className="password"
                      placeholder="新密码（可选，至少 6 位）"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                    <div className="AICampCloud-login-hint">
                      不填新密码则直接通过验证码登录；填写后会在登录前同步更新密码。
                    </div>
                    <button className="btn" type="submit" disabled={logging}>
                      {logging ? <LoadingOutlined /> : '验证码登录'}
                    </button>
                  </>
                )}
              </form>
              <button
                className="AICampCloud-login-switch"
                type="button"
                onClick={() => {
                  setMode((current) => (current === 'password' ? 'forgot-password' : 'password'));
                }}
              >
                {mode === 'password' ? '忘记密码' : '返回账号密码登录'}
              </button>
            </div>
            <div className="w3l_form align-self">
              <div className="left_grid_info">
                <img src={loginIllustration} alt="login" className="img-fluid" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="copyright text-center">
        <p className="copy-footer-29">
          Copyright ©影动医疗版权所有&nbsp;
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
            苏ICP备2021012803号
          </a>
        </p>
      </div>
    </section>
  );
}
