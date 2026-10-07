# Markdown 综合渲染测试文档

> 这是一份用于测试 Markdown 编辑器、查看器和渲染引擎的综合示例文档。\
> 文档包含标题、文本样式、列表、表格、代码块、数学公式、图片、引用、链接等常见 Markdown 元素。

***

## 1. 标题测试

# 一级标题

## 二级标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

***

## 2. 文本样式

这是普通文本。

这是粗体文本。

这是斜体文本。

**这是粗斜体文本。**

~~这是删除线文本。~~

这是一个 `行内代码` 示例。

这是普通文本中的   粗体  、、斜体、、~~删除线~~ 和 **`code`** 混合效果。

Markdown 也可以通过两个空格\
实现强制换行。

***

## 3. 段落

人工智能（Artificial Intelligence，AI）是计算机科学的重要研究方向之一。

近年来，大语言模型、计算机视觉、机器人和多模态人工智能快速发展，使人工智能逐渐从传统的数据分析工具转向更加通用的智能系统。

Markdown 是一种轻量级标记语言，非常适合编写技术文档、项目 README、实验记录和研究笔记。

***

## 4. 无序列表

* 人工智能
* 机器学习
* 深度学习
  * 卷积神经网络
  * 循环神经网络
  * Transformer
    * Encoder
    * Decoder
    * Attention
* 强化学习
* 机器人

另一种写法：

* Python
* C++
* Rust

***

## 5. 有序列表

1. 数据采集
2. 数据清洗
3. 数据预处理
4. 模型训练
5. 模型评估
6. 模型部署

嵌套列表：

1. 准备阶段
   1. 创建项目
   2. 配置环境
   3. 安装依赖
2. 开发阶段
   1. 编写代码
   2. 单元测试
   3. 集成测试
3. 发布阶段
   1. 更新版本号
   2. 创建 Git Tag
   3. 发布 Release

***

## 6. 任务列表

* [x] 创建项目
* [x] 配置开发环境
* [x] 完成核心功能
* [ ] 完成全部测试
* [ ] 编写用户文档
* [ ] 发布正式版本

***

## 7. 引用

> 人工智能正在改变人与计算机交互的方式。

多级引用：

> 第一层引用
>
> > 第二层引用
> >
> > > 第三层引用

带其他元素的引用：

> ### 注意
>
> 在执行重要操作之前，请确认数据已经备份。
>
> * 检查文件
> * 检查数据库
> * 检查配置

***

## 8. 链接

这是一个普通链接：

[GitHub](https://github.com/)

这是一个带说明的链接：

[访问 OpenAI](https://openai.com/ "OpenAI")

自动链接：

<https://github.com/>

***

## 9. 图片

下面是一张通过 GitHub Raw 地址加载的图片：

<img src="https://raw.githubusercontent.com/zakee039/Gallery/main/laptop/20260918205805777.png" alt="" data-align="left" style="zoom: 33%;" title="111111">

带 Alt 文本：

<img src="https://raw.githubusercontent.com/zakee039/Gallery/main/laptop/20260918205805777.png" alt="Markdown 测试图片" data-align="center" style="zoom: 50%;" title="">

***

## 10. 表格

### 基础表格

| 名称          | 类型     | 状态  |
| ----------- | ------ | --- |
| GPT         | 大语言模型  | 正常  |
| Transformer | 神经网络架构 | 正常  |
| RAG         | 检索增强生成 | 正常  |
| CNN         | 卷积神经网络 | 正常  |

### 对齐测试

| 左对齐    | 居中  |   右对齐 |
| :----- | :-: | ----: |
| Apple  | 100 | 12.50 |
| Banana | 200 |  8.25 |
| Orange | 150 | 10.00 |

### 较长内容测试

| 模块   | 功能说明                            | 技术           |
| ---- | ------------------------------- | ------------ |
| 文档解析 | 将 PDF、Word、Markdown 等文件解析为结构化文本 | Python       |
| 向量检索 | 根据语义相似度检索知识库内容                  | Embedding    |
| 智能问答 | 根据检索结果生成自然语言回答                  | LLM          |
| 图像理解 | 分析文档中的图片及视觉内容                   | Vision Model |

***

## 11. 行内代码

可以使用 `pip install numpy` 安装 NumPy。

Python 中可以使用 `print("Hello World")` 输出文本。

变量 `learning_rate` 的默认值设置为 `0.001`。

***

## 12. Python 代码块

```python
import numpy as np

def softmax(x):
    exp_x = np.exp(x - np.max(x))
    return exp_x / np.sum(exp_x)

x = np.array([1.0, 2.0, 3.0])
result = softmax(x)

print(result)
```

***

## 13. JavaScript 代码块

```javascript
function greet(name) {
    console.log(`Hello, ${name}!`);
}

const user = "Markdown";

greet(user);
```

***

## 14. C++ 代码块

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> values = {1, 2, 3, 4, 5};

    for (const auto& value : values) {
        std::cout << value << std::endl;
    }

    return 0;
}
```

***

## 15. JSON 代码块

```json
{
  "name": "Markdown Renderer",
  "version": "1.0.0",
  "enabled": true,
  "features": [
    "code",
    "table",
    "math",
    "image"
  ]
}
```

***

## 16. YAML 代码块

```yaml
application:
  name: markdown-renderer
  version: 1.0.0

server:
  host: 127.0.0.1
  port: 8080

features:
  markdown: true
  math: true
  image: true
```

***

## 17. Shell 代码块

```bash
git status
git add .
git commit -m "docs: add markdown render test"
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin main
git push origin v1.0.0
```

***

## 18. SQL 代码块

```sql
SELECT
    id,
    username,
    created_at
FROM users
WHERE enabled = TRUE
ORDER BY created_at DESC
LIMIT 10;
```

***

## 19. 数学公式

### 行内公式

爱因斯坦质能方程为 $E = mc^2$。

勾股定理可以表示为 $a^2 + b^2 = c^2$。

Sigmoid 函数：

$\sigma(x)=\frac{1}{1+e^{-x}}$

***

## 20. 块级公式

$$
E = mc^2
$$

二次方程求根公式：

$$
x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}
$$

***

## 21. 矩阵公式

$$
A =
\begin{bmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{bmatrix}
$$

矩阵乘法：

$$
C = AB
$$

其中：

$$
C_{ij} = \sum_{k=1}^{n} A_{ik}B_{kj}
$$

***

## 22. 求和与积分

求和：

$$
S = \sum_{i=1}^{n} x_i
$$

平均值：

$$
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$

积分：

$$
\int_a^b f(x)\,dx
$$

高斯积分：

$$
\int_{-\infty}^{+\infty} e^{-x^2}dx = \sqrt{\pi}
$$

***

## 23. 概率与统计公式

正态分布概率密度函数：

$$
f(x)=
\frac{1}{\sigma\sqrt{2\pi}}
\exp\left(
-\frac{(x-\mu)^2}{2\sigma^2}
\right)
$$

期望：

$$
E[X] = \sum_x xP(X=x)
$$

方差：

$$
\operatorname{Var}(X)
=
E[(X-\mu)^2]
$$

***

## 24. 机器学习公式

线性回归：

$$
\hat{y}=w^Tx+b
$$

均方误差：

$$
MSE=
\frac{1}{n}
\sum_{i=1}^{n}
(y_i-\hat{y}_i)^2
$$

梯度下降：

$$
\theta_{t+1}
=
\theta_t
-
\eta\nabla_\theta L(\theta_t)
$$

Softmax：

$$
P(y=i)
=
\frac{e^{z_i}}
{\sum_{j=1}^{K}e^{z_j}}
$$

交叉熵：

$$
L
=
-\sum_{i=1}^{K}
y_i\log(\hat{y}_i)
$$

***

## 25. Transformer Attention

Scaled Dot-Product Attention：

$$
\operatorname{Attention}(Q,K,V)
=
\operatorname{softmax}
\left(
\frac{QK^T}{\sqrt{d_k}}
\right)V
$$

Multi-Head Attention：

$$
\operatorname{MultiHead}(Q,K,V)
=
\operatorname{Concat}
(
head_1,\ldots,head_h
)W^O
$$

其中：

$$
head_i
=
\operatorname{Attention}
(
QW_i^Q,
KW_i^K,
VW_i^V
)
$$

***

## 26. 转义字符

Markdown 中的一些特殊符号可以使用反斜杠进行转义：

\*不是斜体\*

\# 不是标题

\`不是代码\`

\> 不是引用

***

## 27. 水平分割线

第一部分

***

第二部分

***

第三部分

***

第四部分

***

## 28. HTML 混合测试

Markdown 通常允许嵌入部分 HTML：

<div align="center">

居中文本

</div>

<br />

键盘按键：

<kbd>Ctrl</kbd> + <kbd>C</kbd>

<kbd>Ctrl</kbd> + <kbd>V</kbd>

***

## 29. 折叠内容

<details>

<summary>点击展开详细内容</summary>

这里是折叠区域中的内容。

可以继续使用 Markdown：

* 项目一
* 项目二
* 项目三

```python
print("Hello from details")
```

</details>

***

## 30. 混合内容测试

### 一个简单的机器学习实验

实验流程：

1. 导入数据。
2. 对数据进行预处理。
3. 划分训练集和测试集。
4. 训练模型。
5. 计算准确率。

核心代码：

```python
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

model = LogisticRegression()
model.fit(X_train, y_train)

prediction = model.predict(X_test)

accuracy = accuracy_score(y_test, prediction)

print(f"Accuracy: {accuracy:.4f}")
```

实验结果：

| 指标        |    数值 |
| --------- | ----: |
| Accuracy  | 0.952 |
| Precision | 0.947 |
| Recall    | 0.950 |
| F1 Score  | 0.948 |

准确率定义为：

$$
Accuracy
=
\frac{TP+TN}
{TP+TN+FP+FN}
$$

> 结论：   模型能够较好地完成当前分类任务，但仍需要在更大的测试集上验证其泛化能力。

***

## 31. Unicode 与 Emoji 测试

中文：你好，世界！

English: Hello, World!

日本語：こんにちは、世界！

한국어: 안녕하세요, 세계!

Emoji：

😀 😃 😄 🤖 🧠 💻 🚀 🔬 📚

符号：

✓ ✔ ✕ ✖ → ← ↑ ↓ ⇒ ⇔ ∞ ≈ ≠ ≤ ≥

希腊字母：

α β γ δ ε θ λ μ π σ φ ω

大写：

Γ Δ Θ Λ Π Σ Φ Ω

***

## 32. 最终图片测试

<img data-mdmeow-image="true" src="https://raw.githubusercontent.com/zakee039/Gallery/main/laptop/20260918205805777.png" alt="测试图片" data-align="center" style="zoom:100%;">

***

# Markdown Render Test Complete

如果能够正确看到：

* 六级标题
* 粗体   和  斜体
* 表格
* 有序/无序列表
* 任务列表
* 代码高亮
* 数学公式
* 图片
* 引用
* HTML 元素
* 折叠区域
* Emoji 和 Unicode 字符

那么说明当前 Markdown 渲染器已经覆盖了绝大部分常见 Markdown 使用场景。
