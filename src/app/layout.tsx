import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '考场座位分配系统',
  description:
    '上传学生名单 Excel，按班级轮询分配考场座位；支持班级写法智能识别、考号构成可配置、多文件上传，一键导出 Excel / PDF。',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
