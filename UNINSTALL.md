# 卸载说明（uninstall.sh）

仓库根目录包含 `uninstall.sh`，用于清理项目本地依赖与构建产物。脚本支持交互和自动确认，并可选移除系统包与 Rust 工具链（危险操作）。

主要功能：

- 删除 Python 虚拟环境：`python/venv`, `dep/python/venv`
- 删除 `node_modules`
- 清理构建产物：`target`, `src-tauri/target`, `build` 等
- 可选移除系统包（支持 apt/dnf/pacman）：`tesseract-ocr`, `pandoc`, `wkhtmltopdf`, `texlive-xetex` 等
- 可选运行 `rustup self uninstall` 来移除 Rust toolchain（会影响系统 Rust 安装）

示例：

```bash
# 交互式清理（默认）
./uninstall.sh

# 自动确认所有操作
./uninstall.sh -y

# 以 sudo 移除系统包（需要管理员权限）并自动确认
sudo ./uninstall.sh --remove-system -y

# 危险：同时移除系统包与 Rust 工具链
sudo ./uninstall.sh --remove-system --remove-rust -y
```

注意：系统包移除会影响整个系统环境，执行前请务必确认。
