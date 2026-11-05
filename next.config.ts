import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",           // 核心：静态导出，产物在 out/
  typescript: {
    ignoreBuildErrors: true,  // 加速构建（本地已另行跑 tsc --noEmit 校验）
  },
  reactStrictMode: false,
  images: {
    unoptimized: true,        // 必须：静态导出不支持 Next 图片优化服务
  },
  trailingSlash: true,        // 推荐：URL 统一加斜杠，避免子路径资源加载问题
};

export default nextConfig;
