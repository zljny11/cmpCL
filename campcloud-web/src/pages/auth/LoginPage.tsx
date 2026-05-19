import { LoadingOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/auth-provider';
import loginIllustration from './assets/1.png';
import radioDynamicLogo from './assets/logo.png';
import './login.less';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { message } = App.useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [logging, setLogging] = useState(false);

  const handleLogin = async () => {
    if (logging) {
      return;
    }

    if (!username.trim() || !password.trim() || !hospitalName.trim()) {
      if (!username.trim() && !password.trim() && !hospitalName.trim()) {
        message.warning('请输入用户名、密码和医院名称');
      } else if (!username.trim()) {
        message.warning('请输入用户名');
      } else if (!hospitalName.trim()) {
        message.warning('请输入医院名称');
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
        hospitalName: hospitalName.trim(),
      });
      message.success({
        content: '已登录',
        duration: 1.2,
        key: 'login-success',
      });
      navigate('/', { replace: true });
    } catch {
      message.error('登录失败，请检查用户名、密码和医院名称');
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
                  void handleLogin();
                }}
              >
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
                <input
                  type="text"
                  className="text"
                  placeholder="Hospital Name"
                  required
                  autoComplete="organization"
                  value={hospitalName}
                  onChange={(event) => setHospitalName(event.target.value)}
                />
                <button className="btn" type="submit" disabled={logging}>
                  {logging ? <LoadingOutlined /> : 'Log In'}
                </button>
              </form>
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
