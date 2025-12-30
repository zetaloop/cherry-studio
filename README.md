## 自用改版 [Cherry Studio](https://github.com/CherryHQ/cherry-studio)

### 增强功能

- 创建话题分支（复制一份相同的副本）
- 支持 `@` 重复选择同一模型
- 启用模型提供商的时候，不要把它置顶
- 超时时间延长至 30 分钟

### 使用方式

- 直接下载 [Releases](https://github.com/zetaloop/cherry-studio/releases)。

- 本机构建。

  ```bash
  yarn install
  yarn build:win  # or mac, linux
  ```
- GitHub Action 构建

  使用 [Release.yml](https://github.com/zetaloop/cherry-studio/actions/workflows/release.yml) 并将草稿发布，然后更新升级配置并推送。
  ```bash
  yarn update:upgrade-config --tag vX.Y.Z
  ```