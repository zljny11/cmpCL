import { CopyOutlined } from '@ant-design/icons';
import { App, Button, Card, Space, Typography } from 'antd';
import { modelLoaderSource } from './modelLoaderSource';

const installCommand = 'pip install torch cryptography';

const exampleUsage = `from model_loader import load_encrypted_checkpoint

checkpoint = load_encrypted_checkpoint(
    model_path="delivery.model",
    license_path="license.txt",
)
print(checkpoint.keys())`;

export function ModelLoaderPage() {
  const { message } = App.useApp();

  const handleCopy = async (value: string, successMessage: string) => {
    await navigator.clipboard.writeText(value);
    message.success(successMessage);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 8 }}>
          model loader使用指引
        </Typography.Title>
        <Space direction="vertical" size={6}>
          <Typography.Text type="secondary">
            把下面的 Python loader 复制到本地，文件名保存为 `model_loader.py`，再和 `.model`、`license.txt` 放在同一运行环境中使用。
          </Typography.Text>
        </Space>
      </div>

      <Card
        title="运行前准备"
        extra={(
          <Button icon={<CopyOutlined />} onClick={() => void handleCopy(installCommand, '已复制安装命令')}>
            复制安装命令
          </Button>
        )}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Typography.Text>建议环境：`Python 3.10+`</Typography.Text>
          <Typography.Text>推荐安装：`pip install torch cryptography`</Typography.Text>
          <Typography.Text>兼容回退：如果未安装 `cryptography`，则需要命令行中可用 `openssl`。</Typography.Text>
          <Typography.Text>
            文件摆放：将 `delivery.model`、`license.txt`、`model_loader.py` 放在同一目录中。
          </Typography.Text>
        </Space>
      </Card>

      <Card
        title="Python Loader"
        extra={(
          <Button icon={<CopyOutlined />} onClick={() => void handleCopy(modelLoaderSource, '已复制 model_loader.py')}>
            复制代码
          </Button>
        )}
      >
        <pre
          style={{
            margin: 0,
            maxHeight: 520,
            overflow: 'auto',
            padding: 16,
            borderRadius: 12,
            background: '#0f172a',
            color: '#e2e8f0',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {modelLoaderSource}
        </pre>
      </Card>

      <Card
        title="最小使用示例"
        extra={(
          <Button icon={<CopyOutlined />} onClick={() => void handleCopy(exampleUsage, '已复制示例代码')}>
            复制示例
          </Button>
        )}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>
            运行前请确认本机已安装 `torch`，并优先安装 `cryptography`。若没有 `cryptography`，则需要 `openssl` 可执行命令。
          </Typography.Text>
          <pre
            style={{
              margin: 0,
              overflow: 'auto',
              padding: 16,
              borderRadius: 12,
              background: '#f8fafc',
              color: '#0f172a',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {exampleUsage}
          </pre>
        </Space>
      </Card>

      <Card title="说明">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text>说明：</Typography.Text>
          <Typography.Text>1. 如果提示 decrypt failed，请先确认 .model 与 license.txt 来自同一次交付。</Typography.Text>
          <Typography.Text>2. 如果 checkpoint 中包含 state_dict，可继续加载到自己的模型实例。</Typography.Text>
        </Space>
      </Card>
    </Space>
  );
}