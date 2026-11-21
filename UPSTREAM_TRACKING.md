# MDmeow · 上游跟踪记录

上游仓库：<https://github.com/naderi/mowl>

## 当前检查基线

| 字段 | 值 |
| --- | --- |
| MDmeow 版本 | v1.8.7 |
| 最后已移植上游版本（Last Integrated） | **Mowl v1.8.2** |
| 对应上游提交 | `77210558713e9465e7a2e6bb7c985e60e77c63d5` |
| 对应 MDmeow 移植提交 | `c4b1f6f51039850740b7a5f39070cf7c88f35606` |
| 最后已检查上游版本（Last Reviewed） | **Mowl v2.0.1** |
| 对应上游提交 | `7bf312e82618aab732913e70f5a8aa2cee0db8d0` |
| 检查日期 | **2026-11-21** |
| 本轮决定 | **不移植；维持 MDmeow v1.8.7** |

> **注意：最后已检查 ≠ 最后已移植。**「已检查」表示相关版本的变动已评估和做出取舍；不代表功能已合入 MDmeow。后续比较新增上游更新，应从 Last Reviewed 对应的提交开始，而不是从 Last Integrated 重新开始。

## 检查历史

| 日期 | 检查范围 | 结论 | 简要原因 |
| --- | --- | --- | --- |
| 2026-11-21 | Mowl v1.8.3 → v2.0.1 | 暂不移植 | 打印页码/布局及 HTML 混合内容渲染的收益有限；v2.0.0 主题重构与 MDmeow 的 Miku Cream 和 CodeMirror 6 实现重叠且冲突风险较高；v2.0.1 修复属低优先级。保留观察，不修改程序。 |

### 2026-11-21 本轮逐版本摘要

- **v1.8.3**：打印使用整页宽度，显示页码。
- **v1.8.4**：打印页码可配置开启/关闭。
- **v1.8.5**：渲染同时含图片、文字等内容的 HTML 块。
- **v2.0.0**：基于 VS Code 主题格式的配色系统、Windows 标题栏颜色、源码语法高亮。
- **v2.0.1**：非拉丁键盘布局快捷键修复；BOM 导致的文本方向误判修复。

## 后续检查约定

1. 每次检查前获取 Mowl 的上游提交。
2. 以 **Last Reviewed 的提交哈希**为起点审阅新增内容；必要时复查过去未移植但值得重新评估的功能。
3. 即使决定不合并，也更新 **Last Reviewed、检查日期和历史记录**。
4. **只有实际移植并验证通过时**，才更新 **Last Integrated**；不要因为检查或跳过版本而更新它。
5. 单纯检查上游只提交本文件（docs），不因此修改 MDmeow 程序版本、Tag 或 Release。

参考命令（PowerShell，在仓库根目录执行）：

```powershell
git fetch --no-tags https://github.com/naderi/mowl.git main:refs/remotes/upstream/main
git log --oneline 7bf312e82618aab732913e70f5a8aa2cee0db8d0..refs/remotes/upstream/main
```
