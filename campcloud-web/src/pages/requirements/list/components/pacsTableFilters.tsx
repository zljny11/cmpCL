import { SearchOutlined } from '@ant-design/icons';
import { Button, Input, Space } from 'antd';
import type { ColumnType } from 'antd/es/table';

type Getter<T> = (record: T) => string | number | null | undefined;

export function withTextFilter<T extends object>(
  title: string,
  getter: Getter<T>,
  extra?: Partial<ColumnType<T>>,
): ColumnType<T> {
  return {
    title,
    filterDropdown: ({ selectedKeys, setSelectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }}>
        <Input
          allowClear
          placeholder={`搜索${title}`}
          value={(selectedKeys[0] as string) ?? ''}
          onChange={(event) => setSelectedKeys(event.target.value ? [event.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ width: 188, marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button type="primary" size="small" onClick={() => confirm()} icon={<SearchOutlined />}>
            搜索
          </Button>
          <Button
            size="small"
            onClick={() => {
              clearFilters?.();
              confirm({ closeDropdown: true });
            }}
          >
            重置
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? '#1677ff' : '#8c8c8c', fontSize: 12 }} />
    ),
    onFilter: (value, record) => String(getter(record) ?? '').toLowerCase().includes(String(value).toLowerCase()),
    ...extra,
  };
}
