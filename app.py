# 导入各种包和模块
import os
import uuid
import json
from flask import Flask, render_template, request, jsonify, session, send_from_directory, make_response
from datetime import datetime
from flask_cors import CORS
from models import db, User, Clue, Connection, bcrypt
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.utils import secure_filename
from flask_wtf.csrf import CSRFProtect
import bleach

# 创建我们的Flask应用，创建一个总部！
app = Flask(__name__)

# 设置一些秘密配置
app.config['SECRET_KEY'] = os.urandom(24)  # 随机生成的密钥，特工的暗号
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///instance/project.db'  # 数据库位置，我们的线索保险库
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False  # 关闭不必要的追踪，提高性能
app.config['UPLOAD_FOLDER'] = 'static/uploads'  # 图片上传位置，证物室
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif'}  # 允许的图片格式，证物类型限制

# 启用CORS，让不同来源的请求也能访问我们的API，开放合作
CORS(app)

# 初始化CSRF保护，防止跨站请求伪造攻击
csrf = CSRFProtect(app)

# 初始化数据库和密码加密工具
db.init_app(app)
bcrypt.init_app(app)

# 设置用户登录管理器，负责验证身份
login_manager = LoginManager()
login_manager.init_app(app)

# 添加内容安全策略(CSP)头部，防止XSS攻击
@app.after_request
def add_security_headers(response):
    # 内容安全策略，限制资源加载来源
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "  # 允许内联脚本和特定CDN
        "style-src 'self' 'unsafe-inline'; "    # 允许内联样式
        "img-src 'self' data:; "               # 允许加载图片和data URI
        "font-src 'self'; "                    # 限制字体来源
        "connect-src 'self'; "                 # 限制API请求来源
        "frame-src 'none'; "                   # 禁止嵌入框架
        "object-src 'none';"                   # 禁止嵌入对象
    )
    response.headers['Content-Security-Policy'] = csp
    # 其他安全头部
    response.headers['X-Content-Type-Options'] = 'nosniff'  # 防止MIME类型嗅探
    response.headers['X-Frame-Options'] = 'DENY'            # 防止点击劫持
    response.headers['X-XSS-Protection'] = '1; mode=block'  # 启用XSS保护
    return response

# 输入清理函数，防止XSS攻击
def sanitize_input(text):
    if text is None:
        return None
    # 定义允许的安全HTML标签
    allowed_tags = [
        'br', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'em', 'i', 'b', 'u',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'blockquote', 'code', 'pre',
        'a', 'img'
    ]
    # 定义允许的属性
    allowed_attributes = {
        'a': ['href', 'title'],
        'img': ['src', 'alt', 'title']
    }
    # 使用bleach清理HTML标签和危险内容，但允许安全标签
    return bleach.clean(
        text,
        tags=allowed_tags,
        attributes=allowed_attributes,
        strip=True
    )

# 检查文件扩展名是否合法，检查证件真伪
# 这是一个安全措施，防止上传恶意文件
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

# 用户加载函数，根据用户ID从数据库中找出用户，根据工号找员工
# 这个函数会在用户访问需要登录的页面时自动调用，用于加载用户信息
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# 主页路由，接待大厅
# 所有访客首先看到的地方，展示线索板界面
@app.route('/')
def index():
    return render_template('index.html')

# 登录页面路由，入口安检
# 在这里验证身份，输入用户名和密码
@app.route('/AdminLogin')
def login_page():
    return render_template('login.html')

# 文件上传API，证物接收处
# 处理图片上传并返回URL
@app.route('/api/upload', methods=['POST'])
@login_required
def upload_file():
    # 检查是否有文件上传，检查包裹里是否有东西
    if 'file' not in request.files:
        return jsonify({'error': '没有文件部分'}), 400
    file = request.files['file']
    
    # 检查文件名是否为空，检查包裹是否有标签
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
    
    # 检查文件类型是否合法，检查证物是否符合接收标准
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)  # 清理文件名，防止恶意文件名
        ext = filename.rsplit('.', 1)[1].lower()  # 获取文件扩展名
        new_filename = f'{uuid.uuid4()}.{ext}'  # 生成唯一文件名，避免文件名冲突
        file.path = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
        file.save(file.path)
        return jsonify({'url': f'/{app.config["UPLOAD_FOLDER"]}/{new_filename}'})
    
    return jsonify({'error': '文件类型不允许'}), 400

# 获取所有线索，打开线索柜查看所有线索
# 返回所有线索的列表，包括标题、内容、图片、位置等信息
@app.route('/api/clues', methods=['GET'])
def get_clues():
    clues = Clue.query.all()
    return jsonify([
        {
            'id': clue.id,
            'title': clue.title,
            'content': clue.content,
            'image': clue.image,
            'pos_x': clue.pos_x,
            'pos_y': clue.pos_y,
            'clue_id': clue.clue_id,
            'timestamp': clue.timestamp.isoformat() if clue.timestamp else None
        } for clue in clues
    ])

# 创建新线索，添加一张新的线索卡片
# 接收线索信息并保存到数据库
@app.route('/api/clues', methods=['POST'])
@login_required
def create_clue():
    data = request.json
    # 清理用户输入，防止XSS攻击
    title = sanitize_input(data.get('title', ''))
    content = sanitize_input(data.get('content', ''))
    image = sanitize_input(data.get('image', ''))
    
    if not title:
        return jsonify({'error': '线索标题不能为空'}), 400
    
    timestamp = datetime.fromisoformat(data['timestamp']) if data.get('timestamp') else None
    new_clue = Clue(
        title=title,
        content=content,
        image=image,
        pos_x=data['pos_x'],
        pos_y=data['pos_y'],
        clue_id=str(uuid.uuid4()),
        timestamp=timestamp
    )
    db.session.add(new_clue)
    db.session.commit()
    return jsonify({'id': new_clue.id, 'clue_id': new_clue.clue_id})

# 更新线索，修改线索卡片上的信息
# 根据提供的字段更新线索信息
@app.route('/api/clues/<int:id>', methods=['PUT'])
@login_required
def update_clue(id):
    clue = Clue.query.get_or_404(id)
    data = request.json
    
    # 清理用户输入，防止XSS攻击
    title = sanitize_input(data.get('title', ''))
    content = sanitize_input(data.get('content', ''))
    image = sanitize_input(data.get('image', ''))
    
    if title:
        clue.title = title
    if content is not None:
        clue.content = content
    if image is not None:
        clue.image = image
    
    clue.pos_x = data.get('pos_x', clue.pos_x)
    clue.pos_y = data.get('pos_y', clue.pos_y)
    if data.get('timestamp'):
        clue.timestamp = datetime.fromisoformat(data['timestamp'])
    else:
        clue.timestamp = None
    db.session.commit()
    return jsonify({'message': '线索已更新'})

# 删除线索，丢弃一张无用的线索卡片
# 删除指定线索及其所有相关连接
@app.route('/api/clues/<int:id>', methods=['DELETE'])
@login_required
def delete_clue(id):
    clue = Clue.query.get_or_404(id)
    # 删除与该线索相关的所有连接，避免孤立连接
    Connection.query.filter((Connection.source_id == id) | (Connection.target_id == id)).delete()
    db.session.delete(clue)
    db.session.commit()
    return jsonify({'message': '线索已删除'})

# 获取所有连接，查看所有线索之间的连线
# 返回所有连接的列表，包括起始线索、目标线索和注释
@app.route('/api/connections', methods=['GET'])
def get_connections():
    connections = Connection.query.all()
    return jsonify([
        {
            'id': conn.id,
            'source_id': conn.source_id,
            'target_id': conn.target_id,
            'comment': conn.comment
        } for conn in connections
    ])

# 创建新连接，用连线连接两个相关线索
# 在两个线索之间建立关联关系
@app.route('/api/connections', methods=['POST'])
@login_required
def create_connection():
    data = request.json
    
    # 清理用户输入，防止xss攻击
    comment = sanitize_input(data.get('comment', ''))
    
    # 验证输入
    source_id = data.get('source_id')
    target_id = data.get('target_id')
    
    if not isinstance(source_id, int) or not isinstance(target_id, int):
        return jsonify({'error': '无效的线索id'}), 400
    
    # 验证线索是否存在
    source_clue = Clue.query.get(source_id)
    target_clue = Clue.query.get(target_id)
    
    if not source_clue or not target_clue:
        return jsonify({'error': '指定的线索不存在'}), 404
    
    # 检查是否已存在相同的连接
    existing_connection = Connection.query.filter_by(
        source_id=source_id, 
        target_id=target_id
    ).first()
    
    if existing_connection:
        return jsonify({'error': '连接已存在'}), 400
    
    new_conn = Connection(
        source_id=source_id,
        target_id=target_id,
        comment=comment
    )
    db.session.add(new_conn)
    db.session.commit()
    return jsonify({'id': new_conn.id})

# 更新连接，修改连线上的注释
# 修改连接的注释信息
@app.route('/api/connections/<int:id>', methods=['PUT'])
@login_required
def update_connection(id):
    conn = Connection.query.get_or_404(id)
    data = request.json
    
    # 清理用户输入，防止XSS攻击
    comment = sanitize_input(data.get('comment', ''))
    
    conn.comment = comment
    db.session.commit()
    return jsonify({'message': '连接已更新'})

# 移除线索之间的关联关系
@app.route('/api/connections/<int:id>', methods=['DELETE'])
@login_required
def delete_connection(id):
    conn = Connection.query.get_or_404(id)
    db.session.delete(conn)
    db.session.commit()
    return jsonify({'message': '连接已删除'})

# 登录验证路由，卡验证系统
# 检查证件是否有效，验证用户名和密码
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    
    # 清理用户输入，防止XSS攻击
    username = sanitize_input(data.get('username', ''))
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'message': '用户名和密码不能为空'}), 400
    
    # 使用SQLAlchemy ORM防止SQL注入
    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        login_user(user)
        session['logged_in'] = True
        return jsonify({'message': '登录成功'})
    return jsonify({'message': '无效的凭据'}), 401

# 登出路由，下班打卡
# 离开时清除身份信息，结束会话
@app.route('/logout')
@login_required
def logout():
    logout_user()
    session.pop('logged_in', None)
    return jsonify({'message': '成功登出'})

# 状态检查路由，健康检查
# 检查系统是否正常运行，返回简单的状态信息
@app.route('/status')
def status():
    return jsonify({'logged_in': current_user.is_authenticated})

# 导出数据，将所有线索和连接整理成档案
# 将所有线索和连接数据导出为JSON文件
@app.route('/api/data/export', methods=['GET'])
@login_required
def export_data():
    # 获取所有线索和连接
    clues = Clue.query.all()
    connections = Connection.query.all()

    # 准备导出数据
    data = {
        "clues": [
            {
                "id": c.id,
                "title": c.title,
                "content": c.content,
                "image": c.image,
                "pos_x": c.pos_x,
                "pos_y": c.pos_y,
                "clue_id": c.clue_id,
                "timestamp": c.timestamp.isoformat() if c.timestamp else None
            } for c in clues
        ],
        "connections": [
            {
                "source_id": conn.source_id,
                "target_id": conn.target_id,
                "comment": conn.comment
            } for conn in connections
        ]
    }
    # 使用json.dumps并设置ensure_ascii=False来确保中文正确显示
    response = app.response_class(
        response=json.dumps(data, ensure_ascii=False, indent=2),
        status=200,
        mimetype='application/json'
    )
    return response


# 导入数据，将外部档案添加到线索板
# 从JSON文件导入线索和连接数据
@app.route('/api/data/import', methods=['POST'])
@login_required
def import_data():
    # 检查是否有文件
    if 'file' not in request.files:
        return jsonify({'error': '没有文件部分'}), 400
    file = request.files['file']
    if file.filename == '' or not file.filename.endswith('.json'):
        return jsonify({'error': '无效的文件'}), 400
    
    try:
        # 解析JSON数据
        data = json.load(file)
        
        # 验证JSON数据结构
        if not isinstance(data, dict):
            return jsonify({'error': '无效的JSON格式'}), 400
            
        if 'clues' not in data or not isinstance(data['clues'], list):
            return jsonify({'error': '缺少线索数据或格式不正确'}), 400
            
        if 'connections' not in data or not isinstance(data['connections'], list):
            return jsonify({'error': '缺少连接数据或格式不正确'}), 400
        
        # 清空现有数据，准备导入新数据
        Connection.query.delete()
        Clue.query.delete()
        
        # 创建ID映射，用于处理导入后的ID变化
        id_map = {}
        
        # 导入线索
        for clue_data in data.get('clues', []):
            # 验证线索数据
            if not isinstance(clue_data, dict) or 'title' not in clue_data:
                continue  # 跳过无效的线索数据
                
            # 清理用户输入，防止XSS攻击
            title = sanitize_input(clue_data.get('title', ''))
            content = sanitize_input(clue_data.get('content', ''))
            image = sanitize_input(clue_data.get('image', ''))
            
            if not title:
                continue  # 跳过没有标题的线索
                
            timestamp = datetime.fromisoformat(clue_data['timestamp']) if clue_data.get('timestamp') else datetime.utcnow()
            new_clue = Clue(
                title=title,
                content=content,
                image=image,
                pos_x=clue_data.get('pos_x', 0),
                pos_y=clue_data.get('pos_y', 0),
                clue_id=clue_data.get('clue_id', str(uuid.uuid4())),
                timestamp=timestamp
            )
            db.session.add(new_clue)
            db.session.flush()
            id_map[clue_data['id']] = new_clue.id

        # 导入连接，使用ID映射确保连接关系正确
        for conn_data in data.get('connections', []):
            # 验证连接数据
            if not isinstance(conn_data, dict) or 'source_id' not in conn_data or 'target_id' not in conn_data:
                continue  # 跳过无效的连接数据
                
            new_source_id = id_map.get(conn_data['source_id'])
            new_target_id = id_map.get(conn_data['target_id'])
            
            if new_source_id and new_target_id:
                # 清理连接注释，防止XSS攻击
                comment = sanitize_input(conn_data.get('comment', ''))
                
                new_conn = Connection(
                    source_id=new_source_id,
                    target_id=new_target_id,
                    comment=comment
                )
                db.session.add(new_conn)
        
        # 提交所有更改
        db.session.commit()
        return jsonify({'message': '数据导入成功'})
        
    except json.JSONDecodeError:
        # JSON解析错误
        db.session.rollback()
        return jsonify({'error': '无效的JSON格式'}), 400
    except Exception as e:
        # 出错时回滚所有更改
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# 创建管理员用户，任命局Admin
# 这个函数只在初始化时调用一次，创建默认管理员账户
def create_admin_user():
    with app.app_context():
        db.create_all()
        # 检查是否已经存在管理员用户
        if not User.query.filter_by(username='admin').first():
            admin = User(username='admin')
            admin.set_password('admin')
            db.session.add(admin)
            db.session.commit()

if __name__ == '__main__':
    create_admin_user()
    app.run(debug=True)