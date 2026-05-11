import { Result } from 'antd';

export function AdminRequirementListPage() {
  return (
    <Result
      status="info"
      title="管理侧需求列表预留"
      subTitle="当前已完成 /admin/* 路由保护，管理侧业务页将在下一轮继续补齐。"
    />
  );
}
