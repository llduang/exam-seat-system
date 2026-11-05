'use client';

/**
 * 反馈组件：状态消息（5 秒自动隐藏）与处理中加载指示。
 * 移植自 #statusMessage 与 #loading。
 */

import type { StatusMsg } from '@/hooks/use-exam-system';

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-[#d4edda] text-[#155724] border-[#c3e6cb]',
  error: 'bg-[#f8d7da] text-[#721c24] border-[#f5c6cb]',
  info: 'bg-[#d1ecf1] text-[#0c5460] border-[#bee5eb]',
};

export function StatusMessage({ status }: { status: StatusMsg | null }) {
  if (!status) return null;
  return (
    <div
      className={'my-4 whitespace-pre-line rounded-md border p-4 ' + STATUS_STYLES[status.type]}
    >
      {status.message}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="my-6 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-100 border-t-blue-500" />
      <p className="mt-3 text-gray-600">正在处理数据，请稍候...</p>
    </div>
  );
}
