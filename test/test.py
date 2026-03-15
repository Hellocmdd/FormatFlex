import base64
def encode_file(file_path):
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode()
    
input_path1 = '/home/tby/桌面/test/test.JPG'
input_path2 = '/home/tby/桌面/test/test01.pdf'

md_path1 = "/home/tby/桌面/test/p1.md"
md_path2 = "/home/tby/桌面/test/test01.md"

from zai import ZhipuAiClient

# 初始化客户端
client = ZhipuAiClient(api_key="0c651e10ef5941ee914d19b749211424.CvJ045SjXKifhQvb")

image_url = input_path1
pdf_url = input_path2
# 调用布局解析 API
response = client.layout_parsing.create(
    model="glm-ocr",
    file=f"data:application/pdf;base64,{encode_file(pdf_url)}",
)
#输出结果
with open(md_path1, "w", encoding="utf-8") as f1:
     f1.write(response.get("md_results"))


response= client.layout_parsing.create(
     model='glm-ocr',
     file=f'data:image/jpeg;base64,{encode_file(image_url)}'
)

with open(md_path2, "w", encoding="utf-8") as f2:
      #f.write(response.get("md_results"))
      f2.write(response.md_results)