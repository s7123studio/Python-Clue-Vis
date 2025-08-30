# 导入我们需要的各种工具包
from flask_sqlalchemy import SQLAlchemy  # 数据库操作工具，帮助我们管理线索档案
from flask_login import UserMixin  # 用户管理助手，负责处理登录登出
from flask_bcrypt import Bcrypt  # 密码加密工具，保护我们的秘密不被泄露
from datetime import datetime  # 时间工具，记录每个线索的时间戳

# 初始化数据库连接，打开我们的线索档案库
db = SQLAlchemy()
# 初始化密码加密工具，给我们的保险箱加上一把锁
bcrypt = Bcrypt()

class User(UserMixin, db.Model):
    """用户模型，员工档案卡"""
    id = db.Column(db.Integer, primary_key=True)  # 用户ID，员工的工号
    username = db.Column(db.String(150), unique=True, nullable=False)  # 用户名，员工的姓名，不能重复
    password = db.Column(db.String(150), nullable=False)  # 密码，员工的通行证，必须保密

    def set_password(self, password):
        """设置密码，给员工设置新的通行证密码"""
        # 使用bcrypt加密密码，把通行证信息加密存储
        self.password = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        """检查密码是否正确，验证通行证是否有效"""
        # 比对加密后的密码，确保安全
        return bcrypt.check_password_hash(self.password, password)

class Clue(db.Model):
    """线索模型，线索卡片，记录每条重要信息"""
    id = db.Column(db.Integer, primary_key=True)  # 线索ID，线索卡片的编号
    title = db.Column(db.String(100), nullable=False)  # 线索标题，线索卡片的主题
    content = db.Column(db.Text, nullable=True)  # 线索内容，卡片上详细记录的信息
    image = db.Column(db.String(100), nullable=True)  # 线索图片，附在卡片上的照片
    pos_x = db.Column(db.Float, nullable=False, default=0)  # X坐标位置，线索板上的横向位置
    pos_y = db.Column(db.Float, nullable=False, default=0)  # Y坐标位置，线索板上的纵向位置
    clue_id = db.Column(db.String(50), unique=True, nullable=False)  # 线索唯一标识，线索的指纹
    timestamp = db.Column(db.DateTime, nullable=True)  # 时间戳，记录线索发生的时间

class Connection(db.Model):
    """连接模型，连接两条线索的连线，表示它们之间的关系"""
    id = db.Column(db.Integer, primary_key=True)  # 连接ID，每条连线的编号
    source_id = db.Column(db.Integer, db.ForeignKey('clue.id'), nullable=False)  # 源线索ID，连线的起点
    target_id = db.Column(db.Integer, db.ForeignKey('clue.id'), nullable=False)  # 目标线索ID，连线的终点
    comment = db.Column(db.String(200), nullable=True)  # 连接注释，解释为什么这两条线索有关联

    # 建立与Clue模型的关系，建立线索之间的桥梁
    source = db.relationship('Clue', foreign_keys=[source_id], backref='source_connections')  # 源线索关系
    target = db.relationship('Clue', foreign_keys=[target_id], backref='target_connections')  # 目标线索关系
