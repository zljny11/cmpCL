import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result, Space } from 'antd';

type Props = {
  children: ReactNode;
  routeName: string;
};

type State = {
  error: Error | null;
};

export class LazyRouteErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[lazy-route] ${this.props.routeName} failed`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <Result
        status="error"
        title={`${this.props.routeName} 页面加载失败`}
        subTitle={error.message || '前端模块加载失败，请刷新页面后重试'}
        extra={
          <Space>
            <Button type="primary" onClick={this.handleRetry}>
              刷新重试
            </Button>
            <Button onClick={() => window.location.assign('/')}>返回首页</Button>
          </Space>
        }
      />
    );
  }
}
