# GitHub 上传教程（零基础版）

> 目标：把本项目的全部代码上传到 GitHub，做成公开作品集。全程约 20 分钟。

## 第 1 步：注册 GitHub 账号（一次性）

1. 打开 https://github.com
2. 点右上角 **Sign up**，用邮箱注册（用户名建议用英文，如姓名拼音）
3. 到邮箱点验证链接，完成注册

## 第 2 步：在 GitHub 上新建仓库（一次性）

1. 登录后点右上角 **+** → **New repository**
2. 填写：
   - Repository name：`heima-jizhang`
   - Description：`黑马记账 - 个人本地记账桌面应用（Electron + Vue 3 + SQLite，与 AI 智能体协作开发）`
   - 选 **Public**
3. **不要勾选** "Add a README file" 等三个勾选框（本地已有，勾了会冲突）
4. 点 **Create repository**
5. 记下页面显示的仓库地址，形如：
   `https://github.com/你的用户名/heima-jizhang.git`

## 第 3 步：在 VSCode 里执行上传命令

打开 VSCode → 打开文件夹 `D:\黑马记账 APP` → 菜单「终端 → 新建终端」，逐条粘贴执行：

### 3.1 把本地项目与 GitHub 仓库关联（只需一次）

```bash
git remote add origin https://github.com/你的用户名/heima-jizhang.git
```

> 注意：把「你的用户名」换成您注册的 GitHub 用户名。粘贴到终端后按回车。

### 3.2 推送全部代码到 GitHub（首次上传）

```bash
git push -u origin master
```

- 首次推送时，**电脑会弹出浏览器窗口让您登录 GitHub**，点绿色授权按钮即可
- 如果弹出的是输入框要求输入用户名/密码：用户名输 GitHub 用户名；"密码"不能输登录密码，要用 **Personal Access Token**（见下方"常见问题 2"）
- 看到 `master -> master` 的字样就是成功了

### 3.3 验证

刷新 GitHub 仓库页面，能看到 README.md 和全部代码 = 上传成功 🎉

## 以后每次更新软件后，再执行这两条

```bash
git add -A
git commit -m "更新说明（随便写，如：修复某bug）"
git push
```

## 常见问题

**1. 提示 fatal: remote origin already exists（已关联过）**
说明第 3.1 步做过两次，忽略即可，直接执行 3.2。

**2. 没有弹出浏览器授权，而是要求输入密码**
GitHub 不允许用登录密码推送。解决：
- 打开 https://github.com/settings/tokens → Generate new token (classic)
- 勾选 `repo` 权限 → 生成 → **复制**那串 `ghp_` 开头的令牌
- 推送时用户名输 GitHub 用户名，"密码"粘贴这串令牌（粘贴时不显示字符是正常的）

**3. 推送很慢或卡住（国内网络访问 GitHub 可能不稳定）**
- 多等一会儿，或换个时间段重试 `git push`
- 实在不行换码云 Gitee（gitee.com），操作完全一样，只需把网址换成 Gitee 的

**4. 想改默认分支名为 main**
```bash
git branch -M main
git push -u origin main
```

## 命令速查

| 命令 | 作用 |
|---|---|
| `git status` | 查看有哪些改动 |
| `git add -A` | 把所有改动加入待提交 |
| `git commit -m "说明"` | 存档一次（本地） |
| `git push` | 把存档同步到 GitHub |
| `git log --oneline` | 查看存档历史 |
