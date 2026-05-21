import { Button, Card, Skeleton, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { profileApi } from '../../services/api/profile';
import { requirementsApi } from '../../services/api/requirements';
import { useAuth } from '../../app/providers/auth-provider';
import { isProfileComplete } from '../../utils/profileCompletion';
import { DatasetBatchItem, RequirementDetail, RequirementListItem } from '../../types/requirements';

type JourneyStep = {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
  hint?: string;
};

function getRouteRequirementId(pathname: string, search: string) {
  const pathnameMatch = pathname.match(/^\/requirements\/([^/]+)(?:\/upload)?$/);
  if (pathnameMatch?.[1]) {
    return pathnameMatch[1];
  }

  const params = new URLSearchParams(search);
  return params.get('requirementId');
}

function isRequirementCreateRoute(pathname: string) {
  return pathname === '/requirements/create';
}

function getJourneyState(params: {
  profileCompleted: boolean;
  hasAnyRequirement: boolean;
  requirement?: RequirementListItem | RequirementDetail | null;
  batches: DatasetBatchItem[];
}) {
  const { profileCompleted, hasAnyRequirement, requirement, batches } = params;
  const hasRequirement = Boolean(requirement);
  const hasInitialUpload = batches.length > 0;
  const status = requirement?.status;
  const isInProgress = status === 'processing' || status === 'waiting_user';
  const isDelivered = status === 'completed';

  let currentKey = 'profile';
  if (profileCompleted && !hasAnyRequirement) {
    currentKey = 'submit';
  } else if (profileCompleted && hasRequirement && !hasInitialUpload) {
    currentKey = 'upload';
  } else if (profileCompleted && hasRequirement && hasInitialUpload && isDelivered) {
    currentKey = 'delivery';
  } else if (profileCompleted && hasRequirement && hasInitialUpload && isInProgress) {
    currentKey = 'processing';
  } else if (profileCompleted && hasRequirement && hasInitialUpload) {
    currentKey = 'acceptance';
  }
  const nextAction =
    !profileCompleted
      ? { label: '去完善资料', to: '/profile' }
      : !hasAnyRequirement
        ? { label: '去提交需求', to: '/requirements/create' }
        : !hasRequirement
          ? { label: '进入需求列表', to: '/requirements' }
        : !hasInitialUpload
          ? { label: '去上传数据', to: `/requirements/${requirement?.id}/upload` }
          : { label: '查看当前需求', to: `/requirements/${requirement?.id}` };

  const steps: JourneyStep[] = [
    {
      key: 'profile',
      label: '完善资料',
      done: profileCompleted,
      current: currentKey === 'profile',
      hint: profileCompleted ? '资料已完善' : '请先补齐联系人、医院、科室、职称等信息',
    },
    {
      key: 'submit',
      label: '提交需求',
      done: hasAnyRequirement,
      current: currentKey === 'submit',
      hint: hasRequirement
        ? `当前绑定需求：${requirement?.title ?? '-'}`
        : hasAnyRequirement
          ? '你有多个需求，请进入具体需求页查看该需求的流程进度'
          : '创建并提交科研需求单',
    },
    {
      key: 'upload',
      label: '上传数据',
      done: hasInitialUpload,
      current: currentKey === 'upload',
      hint: hasRequirement
        ? hasInitialUpload
          ? `已上传 ${batches.length} 个批次`
          : '上传首批数据后才会进入受理流程'
        : hasAnyRequirement
          ? '请先进入某个具体需求页，再查看该需求的数据上传进度'
          : '提交需求后可上传首批数据',
    },
    {
      key: 'acceptance',
      label: '等待受理',
      done: hasInitialUpload && isInProgress,
      current: currentKey === 'acceptance',
      hint: hasRequirement
        ? hasInitialUpload
          ? '已提交并上传数据，等待管理侧受理。'
          : '先完成首批数据上传'
        : hasAnyRequirement
          ? '请进入某个具体需求页，查看该需求当前受理进度'
          : '提交并上传数据后进入受理流程',
    },
    {
      key: 'processing',
      label: '受理中',
      done: isDelivered,
      current: currentKey === 'processing',
      hint:
        hasRequirement
          ? isInProgress
            ? '需求已进入处理阶段，请等待后续处理或交付结果。'
            : isDelivered
              ? '处理阶段已完成。'
              : '受理后会进入处理阶段。'
          : hasAnyRequirement
            ? '请进入某个具体需求页，查看该需求是否已经进入处理阶段'
            : '需求受理后会进入处理阶段',
    },
    {
      key: 'delivery',
      label: '交付',
      done: isDelivered,
      current: currentKey === 'delivery',
      hint: hasRequirement
        ? isDelivered
          ? '交付已完成，可前往需求详情查看交付内容'
        : '处理完成后会进入最终交付'
        : hasAnyRequirement
          ? '请进入某个具体需求页，查看该需求是否已完成交付'
          : '需求处理完成后会进入最终交付',
    },
  ];

  const currentIndex = steps.findIndex((step) => step.current);
  const normalizedSteps = steps.map((step, index) => ({
    ...step,
    done: currentIndex > 0 && index < currentIndex ? true : step.done,
  }));

  return {
    steps: normalizedSteps,
    nextAction,
    trackedTitle: requirement?.title ?? null,
  };
}

export function UserRequirementJourneyCard() {
  const location = useLocation();
  const { user } = useAuth();
  const isCreatePage = isRequirementCreateRoute(location.pathname);
  const routeRequirementId = getRouteRequirementId(location.pathname, location.search);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.getProfile,
    enabled: user?.role === 'user',
  });
  const latestRequirementQuery = useQuery({
    queryKey: ['user-journey', 'latest-requirement'],
    queryFn: () => requirementsApi.list({ page: 1, pageSize: 2 }),
    enabled: user?.role === 'user' && !routeRequirementId && !isCreatePage,
  });

  const fallbackRequirementId = latestRequirementQuery.data?.total === 1 ? latestRequirementQuery.data.list[0]?.id || '' : '';
  const trackedRequirementId = routeRequirementId || fallbackRequirementId;

  const requirementQuery = useQuery({
    queryKey: ['user-journey', 'requirement-detail', trackedRequirementId],
    queryFn: () => requirementsApi.detail(trackedRequirementId),
    enabled: user?.role === 'user' && Boolean(trackedRequirementId),
  });
  const batchesQuery = useQuery({
    queryKey: ['user-journey', 'dataset-batches', trackedRequirementId],
    queryFn: () => requirementsApi.listDatasetBatches(trackedRequirementId, { page: 1, pageSize: 100 }),
    enabled: user?.role === 'user' && Boolean(trackedRequirementId),
  });

  const profileCompleted = isProfileComplete({
    ...profileQuery.data,
    hospitalName: user?.hospitalName ?? null,
  });

  const journey = getJourneyState({
    profileCompleted,
    hasAnyRequirement: isCreatePage ? false : (latestRequirementQuery.data?.total ?? 0) > 0 || Boolean(routeRequirementId),
    requirement: isCreatePage
      ? null
      : requirementQuery.data ?? (latestRequirementQuery.data?.total === 1 ? latestRequirementQuery.data.list[0] : null),
    batches: batchesQuery.data?.list ?? [],
  });

  const isLoading =
    profileQuery.isLoading ||
    (!isCreatePage && (latestRequirementQuery.isLoading || requirementQuery.isLoading || batchesQuery.isLoading));

  return (
    <Card
      size="small"
      style={{
        margin: '0 12px 16px',
        borderRadius: 18,
        background: 'linear-gradient(180deg, #ffffff 0%, #f5fafe 100%)',
        border: '1px solid #d8e6f0',
        boxShadow: '0 10px 24px rgba(41, 84, 117, 0.08)',
      }}
      bodyStyle={{ padding: 14 }}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <div>
          <Typography.Text strong style={{ display: 'block', color: '#23445d' }}>
            需求进度指引
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {journey.trackedTitle
              ? `当前跟踪：${journey.trackedTitle}`
              : isCreatePage
                ? '当前正在创建新需求，可按流程先完成本次提交'
                : (latestRequirementQuery.data?.total ?? 0) > 1 && !routeRequirementId
                ? '你有多个需求，请进入具体需求页后查看该需求的流程进度'
                : '当前还没有绑定需求，先完善资料并创建第一条需求'}
          </Typography.Text>
        </div>

        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} title={false} />
        ) : (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            {journey.steps.map((step, index) => {
              return (
                <div
                  key={step.key}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    paddingBottom: index === journey.steps.length - 1 ? 0 : 12,
                    marginBottom: index === journey.steps.length - 1 ? 0 : 12,
                    border:
                      step.current ? '1px solid #8cbef2' : step.done ? '1px solid #a9dcc1' : '1px solid #d8e6f0',
                    background: step.current ? '#eef6ff' : step.done ? '#edf9f1' : '#ffffff',
                  }}
                >
                  <Typography.Text
                    strong
                    style={{
                      color: step.current ? '#0f6cbd' : step.done ? '#237653' : '#51606d',
                      display: 'block',
                      lineHeight: 1.5,
                    }}
                  >
                    {step.label}
                    {step.current ? '（当前）' : ''}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {step.hint}
                  </Typography.Text>
                </div>
              );
            })}
          </Space>
        )}

        <Link to={journey.nextAction.to}>
          <Button type="primary" block size="small">
            {journey.nextAction.label}
          </Button>
        </Link>
      </Space>
    </Card>
  );
}
