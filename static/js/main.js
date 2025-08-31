document.addEventListener('DOMContentLoaded', () => {
    // State
    let clues = {};
    let lines = [];
    let isAdmin = false;
    let contextMenuVisible = false;
    
    // Panzoom & Connection State
    let pz;
    let isConnecting = false;
    let connectionStartNode = null;
    let tempLine = null;
    let mouseFollower = null;
    let lastMousePos = { x: 0, y: 0 };

    // DOM Elements
    const board = document.getElementById('clue-board');
    const canvas = document.getElementById('canvas');
    const clueModal = document.getElementById('clue-modal');
    const clueForm = document.getElementById('clue-form');
    const contextMenu = document.getElementById('context-menu');
    const importFileInput = document.getElementById('import-file-input');
    const timeUnknownCheckbox = document.getElementById('clue-time-unknown');
    const timestampInput = document.getElementById('clue-timestamp');
    const searchBox = document.getElementById('search-box');
    const analysisBtn = document.getElementById('analysis-btn');
    const highlightKeyNodesBtn = document.getElementById('highlight-key-nodes');
    const isolateNodesBtn = document.getElementById('isolate-nodes');
    const clearAnalysisBtn = document.getElementById('clear-analysis');

    // --- API Calls ---
    // 获取CSRF令牌的辅助函数
    function getCSRFToken() {
        return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    }
    
    const api = {
        getStatus: () => fetch('/status').then(res => res.json()),
        getClues: () => fetch('/api/clues').then(res => res.json()),
        getConnections: () => fetch('/api/connections').then(res => res.json()),
        createClue: (data) => fetch('/api/clues', { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            }, 
            body: JSON.stringify(data) 
        }).then(res => res.json()),
        updateClue: (id, data) => fetch(`/api/clues/${id}`, { 
            method: 'PUT', 
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            }, 
            body: JSON.stringify(data) 
        }),
        deleteClue: (id) => fetch(`/api/clues/${id}`, { 
            method: 'DELETE',
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        }),
        createConnection: (data) => fetch('/api/connections', { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            }, 
            body: JSON.stringify(data) 
        }).then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw err; });
            }
            return res.json();
        }),
        updateConnection: (id, data) => fetch(`/api/connections/${id}`, { 
            method: 'PUT', 
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            }, 
            body: JSON.stringify(data) 
        }),
        deleteConnection: (id) => fetch(`/api/connections/${id}`, { 
            method: 'DELETE',
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        }),
    };

    // --- Helpers ---
    function toLocalISOString(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // --- Rendering ---
    function renderClue(clue) {
        let node = document.getElementById(`clue-${clue.id}`);
        if (!node) {
            node = document.createElement('div');
            node.className = 'clue-node';
            node.id = `clue-${clue.id}`;
            canvas.appendChild(node);
            node.addEventListener('click', (e) => {
                if (isConnecting) {
                    e.preventDefault();
                    e.stopPropagation();
                    completeConnection(e.currentTarget);
                }
            });
        }
        
        node.style.left = `${clue.pos_x}px`;
        node.style.top = `${clue.pos_y}px`;
        node.setAttribute('data-x', clue.pos_x);
        node.setAttribute('data-y', clue.pos_y);

        let content = `<h3>${clue.title}</h3>`;
        if (clue.image) content += `<img src="${clue.image}" alt="Clue Image">`;
        if (clue.content) content += `<p>${clue.content}</p>`;
        
        const timeText = clue.timestamp ? new Date(clue.timestamp).toLocaleString() : '时间未知';
        content += `<div class="timestamp">${timeText}</div>`;

        node.innerHTML = content;
        clues[clue.id] = { node, data: clue };
        return node;
    }

    function renderAllLines() {
        lines.forEach(l => {
            if (l.line) l.line.remove();
            if (l.hitbox) l.hitbox.remove();
        });
        lines = [];

        api.getConnections().then(connections => {
            connections.forEach(conn => {
                const source = clues[conn.source_id]?.node;
                const target = clues[conn.target_id]?.node;
                if (source && target) {
                    const line = new LeaderLine(source, target, {
                        color: 'rgba(255, 255, 255, 0.7)',
                        size: 2,
                        middleLabel: LeaderLine.pathLabel(conn.comment || '', {
                            color: '#fff',
                            outlineColor: 'transparent',
                            fontSize: '14px',
                            fontWeight: 'normal',
                            offset: [0, 20],
                            onShow: (label) => { 
                                label.style.stroke = 'none';
                                label.style.webkitTextStroke = 'none';
                                label.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
                            }
                        })
                    });
                    const hitbox = createLineHitbox(conn);
                    lines.push({ line, conn, hitbox });
                }
            });
            updateAllHitboxPositions();
        });
    }

    function createLineHitbox(conn) {
        const hitbox = document.createElement('div');
        hitbox.className = 'line-hitbox';
        hitbox.dataset.connId = conn.id;
        hitbox.dataset.connComment = conn.comment || '';
        board.appendChild(hitbox);
        return hitbox;
    }

    function updateAllHitboxPositions() {
        lines.forEach(l => {
            if (!l.line.start || !l.line.end) return;
            const sourceRect = l.line.start.getBoundingClientRect();
            const targetRect = l.line.end.getBoundingClientRect();
            const boardRect = board.getBoundingClientRect();
            const midX1 = sourceRect.left + sourceRect.width / 2;
            const midY1 = sourceRect.top + sourceRect.height / 2;
            const midX2 = targetRect.left + targetRect.width / 2;
            const midY2 = targetRect.top + targetRect.height / 2;
            
            // 计算连接线中点位置
            const centerX = (midX1 + midX2) / 2;
            const centerY = (midY1 + midY2) / 2;
            
            // 添加与注释文本相同的偏移量 [0, 20]
            const offsetX = 0;
            const offsetY = 20;
            
            l.hitbox.style.left = `${centerX + offsetX - boardRect.left}px`;
            l.hitbox.style.top = `${centerY + offsetY - boardRect.top}px`;
        });
    }

    // --- Analysis Mode ---
    function clearAnalysis() {
        Object.values(clues).forEach(({ node }) => {
            node.classList.remove('analysis-highlight', 'analysis-dimmed');
        });
    }

    function highlightKeyNodes() {
        clearAnalysis();
        const degree = {};
        Object.keys(clues).forEach(id => degree[id] = 0);

        lines.forEach(({ conn }) => {
            degree[conn.source_id]++;
            degree[conn.target_id]++;
        });

        const sortedNodes = Object.entries(degree).sort((a, b) => b[1] - a[1]);
        const threshold = Math.ceil(sortedNodes.length * 0.1);
        const keyNodeIds = new Set(sortedNodes.slice(0, threshold).map(entry => entry[0]));

        Object.entries(clues).forEach(([id, { node }]) => {
            if (keyNodeIds.has(id)) {
                node.classList.add('analysis-highlight');
            } else {
                node.classList.add('analysis-dimmed');
            }
        });
    }

    function identifyIsolatedNodes() {
        clearAnalysis();
        const connectedNodeIds = new Set();
        lines.forEach(({ conn }) => {
            connectedNodeIds.add(conn.source_id.toString());
            connectedNodeIds.add(conn.target_id.toString());
        });

        Object.entries(clues).forEach(([id, { node }]) => {
            if (!connectedNodeIds.has(id)) {
                // No special highlight, just dim others
            } else {
                node.classList.add('analysis-dimmed');
            }
        });
    }

    // --- 缩放平移与连接模式功能 ---

/**
 * 初始化线索板的缩放和平移功能，给线索板装上放大镜和移动功能
 * 这样可以放大查看细节，或者平移查看不同区域的线索
 */
function initializePanzoom() {
    pz = panzoom(canvas, {
        maxZoom: 2,
        minZoom: 0.2,
        filterTarget: (e) => {
            return e.target.closest('.clue-node') || e.target.closest('.line-hitbox') || e.target.closest('#search-container') || e.target.closest('#analysis-container');
        }
    });

    const updateOnPan = () => {
        requestAnimationFrame(() => {
            lines.forEach(l => l.line.position());
            updateAllHitboxPositions();
        });
    };

    const updateOnZoom = () => {
        setTimeout(() => {
            lines.forEach(l => l.line.position());
            updateAllHitboxPositions();
        }, 50);
    };

    pz.on('pan', updateOnPan);
    pz.on('zoom', updateOnZoom);
}

/**
 * 启动连接模式，可以在线索之间画线连接
 * 拿出连线，准备将相关线索串联起来
 * 
 * @param {HTMLElement} sourceNode - 开始连接的线索节点
 */
function startConnectionMode(sourceNode) {
    isConnecting = true;
    connectionStartNode = sourceNode;
    connectionStartNode.style.outline = '2px dashed #007bff';
    board.style.cursor = 'crosshair';
    mouseFollower = document.createElement('div');
    mouseFollower.style.cssText = 'position: absolute; width: 1px; height: 1px; pointer-events: none;';
    canvas.appendChild(mouseFollower);
    tempLine = new LeaderLine(connectionStartNode, mouseFollower, { color: 'rgba(0, 170, 255, 0.8)', size: 2, path: 'fluid' });
    board.addEventListener('mousemove', handleBoardMouseMove);
}

/**
 * 取消连接模式，收起了连线
 * 清理所有连接相关的状态和视觉效果
 */
function cancelConnectionMode() {
    if (!isConnecting) return;
    isConnecting = false;
    if (connectionStartNode) connectionStartNode.style.outline = 'none';
    if (tempLine) tempLine.remove();
    if (mouseFollower) mouseFollower.remove();
    board.style.cursor = 'default';
    connectionStartNode = null;
    tempLine = null;
    mouseFollower = null;
    board.removeEventListener('mousemove', handleBoardMouseMove);
}

/**
 * 完成两个线索之间的连接，用连线将两个线索钉在板上
 * 先检查是否尝试连接同一个线索，然后创建新连接
 * 
 * @param {HTMLElement} targetNode - 目标线索节点
 */
function completeConnection(targetNode) {
    const sourceId = parseInt(connectionStartNode.id.split('-')[1]);
    const targetId = parseInt(targetNode.id.split('-')[1]);
    if (sourceId === targetId) {
        cancelConnectionMode();
        return;
    }
    const comment = prompt("请输入此连接的注释（可选）:");
    api.createConnection({ source_id: sourceId, target_id: targetId, comment: comment })
        .then(() => {
            renderAllLines();
            cancelConnectionMode();
        })
        .catch(error => {
            console.error('创建连接失败:', error);
            alert('创建连接失败: ' + (error.message || '未知错误'));
            cancelConnectionMode();
        });
}

    // --- 模态框和菜单功能 ---

/**
 * 显示线索编辑模态框，打开一个线索卡片进行查看或编辑
 * 可以是创建新线索，也可以是编辑现有线索
 * 
 * @param {Object|null} clue - 要编辑的线索对象，如果为null则创建新线索
 */
function showClueModal(clue = null) {
    clueForm.reset();
    document.getElementById('clue-image-url').value = '';
    if (clue) {
        // 编辑现有线索模式
        document.getElementById('clue-modal-title').innerText = '编辑线索';
        document.getElementById('clue-id').value = clue.id;
        document.getElementById('clue-title').value = clue.title;
        document.getElementById('clue-content').value = clue.content || '';
        document.getElementById('clue-image-url').value = clue.image || '';
        
        // 处理时间戳
        if (clue.timestamp) {
            timeUnknownCheckbox.checked = false;
            timestampInput.disabled = false;
            timestampInput.value = toLocalISOString(new Date(clue.timestamp));
        } else {
            timeUnknownCheckbox.checked = true;
            timestampInput.disabled = true;
            timestampInput.value = '';
        }
    } else {
        // 创建新线索模式
        document.getElementById('clue-modal-title').innerText = '创建线索';
        document.getElementById('clue-id').value = '';
        timeUnknownCheckbox.checked = false;
        timestampInput.disabled = false;
        timestampInput.value = toLocalISOString(new Date());
    }
    clueModal.style.display = 'flex';
}

/**
 * 隐藏线索编辑模态框，合上了线索卡片
 */
function hideClueModal() {
    clueModal.style.display = 'none';
}

/**
 * 显示上下文菜单，右键点击时弹出的工具选项
 * 根据点击的目标（线索节点、连接线或空白区域）显示不同的菜单项
 * 
 * @param {number} x - 菜单显示的X坐标
 * @param {number} y - 菜单显示的Y坐标
 * @param {HTMLElement} target - 点击的目标元素
 */
function showContextMenu(x, y, target) {
    hideContextMenu();
    let menuItems = '';
    const targetClueNode = target.closest('.clue-node');
    const targetLineHitbox = target.closest('.line-hitbox');

    if (targetClueNode) {
        // 点击的是线索节点
        const targetClueId = parseInt(targetClueNode.id.split('-')[1]);
        menuItems += `<li data-action="edit-clue" data-id="${targetClueId}">编辑线索</li>`;
        menuItems += `<li data-action="delete-clue" data-id="${targetClueId}">删除线索</li>`;
        menuItems += `<hr>`;
        menuItems += `<li data-action="start-connection" data-id="${targetClueId}">连接线索</li>`;
    } else if (targetLineHitbox) {
        // 点击的是连接线
        const connId = targetLineHitbox.dataset.connId;
        const connComment = targetLineHitbox.dataset.connComment;
        menuItems += `<li data-action="edit-conn" data-id="${connId}" data-comment="${connComment}">编辑注释</li>`;
        menuItems += `<li data-action="delete-conn" data-id="${connId}">删除连接</li>`;
    } else {
        // 点击的是空白区域
        menuItems += `<li data-action="add-clue">添加线索</li>`;
        menuItems += `<hr>`;
        menuItems += `<li data-action="import">导入数据</li>`;
        menuItems += `<li data-action="export">导出数据</li>`;
    }

    contextMenu.innerHTML = `<ul>${menuItems}</ul>`;
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';
    contextMenuVisible = true;
}

/**
 * 隐藏上下文菜单，收起了工具选项
 */
function hideContextMenu() {
    contextMenu.style.display = 'none';
    contextMenuVisible = false;
}

    // --- Event Handlers ---
    timeUnknownCheckbox.addEventListener('change', (e) => {
        timestampInput.disabled = e.target.checked;
        if (e.target.checked) {
            timestampInput.value = '';
        }
    });

    searchBox.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const matchedClueIds = new Set();

        Object.values(clues).forEach(({ node, data }) => {
            const titleMatch = data.title.toLowerCase().includes(searchTerm);
            const contentMatch = data.content && data.content.toLowerCase().includes(searchTerm);
            
            if (titleMatch || contentMatch) {
                node.classList.remove('filtered');
                matchedClueIds.add(data.id.toString());
            } else {
                node.classList.add('filtered');
            }
        });

        lines.forEach(({ line, conn }) => {
            const sourceMatch = matchedClueIds.has(conn.source_id.toString());
            const targetMatch = matchedClueIds.has(conn.target_id.toString());
            
            const lineBody = document.body.querySelector(`[data-leader-line-id="${line._id}"]`);
            if (sourceMatch && targetMatch) {
                if (lineBody) lineBody.classList.remove('filtered');
            } else {
                if (lineBody) lineBody.classList.add('filtered');
            }
        });
    });

    highlightKeyNodesBtn.addEventListener('click', highlightKeyNodes);
    isolateNodesBtn.addEventListener('click', identifyIsolatedNodes);
    clearAnalysisBtn.addEventListener('click', clearAnalysis);

    function handleBoardRightClick(e) {
        e.preventDefault();
        if (isConnecting) {
            cancelConnectionMode();
            return;
        }
        // 只有管理员才能看到右键菜单
        if (!isAdmin) return;
        
        const transform = pz.getTransform();
        const screenX = e.clientX;
        const screenY = e.clientY;
        
        lastMousePos.x = (screenX - transform.x) / transform.scale;
        lastMousePos.y = (screenY - transform.y) / transform.scale;

        showContextMenu(screenX, screenY, e.target);
    }

    function handleBoardMouseMove(e) {
        if (isConnecting && mouseFollower) {
            const transform = pz.getTransform();
            mouseFollower.style.left = `${(e.clientX - transform.x) / transform.scale}px`;
            mouseFollower.style.top = `${(e.clientY - transform.y) / transform.scale}px`;
            tempLine.position();
        }
    }
    
    /**
 * 处理上下文菜单点击事件，选择了工具箱中的某个工具
 * 根据选择的操作类型执行相应的功能
 * 
 * @param {Event} e - 点击事件对象
 */
function handleContextMenuClick(e) {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    if (!action) return;

    hideContextMenu();

    switch (action) {
        case 'add-clue':
            // 添加新线索
            showClueModal();
            break;
        case 'edit-clue':
            // 编辑现有线索
            showClueModal(clues[id].data);
            break;
        case 'delete-clue':
            // 删除线索
            if (confirm('您确定要删除此线索吗？')) {
                api.deleteClue(id).then(() => {
                    clues[id].node.remove();
                    delete clues[id];
                    renderAllLines();
                });
            }
            break;
        case 'start-connection':
            // 开始连接线索
            startConnectionMode(clues[id].node);
            break;
        case 'edit-conn':
            // 编辑连接注释
            const oldComment = e.target.dataset.comment;
            const newComment = prompt("编辑连接注释:", oldComment);
            if (newComment !== null) {
                api.updateConnection(parseInt(id), { comment: newComment }).then(renderAllLines);
            }
            break;
        case 'delete-conn':
            // 删除连接
            if (confirm('您确定要删除此连接吗？')) {
                api.deleteConnection(parseInt(id)).then(renderAllLines);
            }
            break;
        case 'import':
            // 导入数据
            importFileInput.click();
            break;
        case 'export':
            // 导出数据
            window.open('/api/data/export', '_blank');
            break;
    }
}

/**
 * 处理线索表单提交事件，填写完线索卡片后保存
 * 验证表单数据，处理图片上传，然后创建新线索或更新现有线索
 * 
 * @param {Event} e - 表单提交事件对象
 */
async function handleClueFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('clue-id').value;
    const imageUpload = document.getElementById('clue-image-upload').files[0];
    let imageUrl = document.getElementById('clue-image-url').value;

    // 处理图片上传
    if (imageUpload) {
        const formData = new FormData();
        formData.append('file', imageUpload);
        const response = await fetch('/api/upload', { 
            method: 'POST', 
            body: formData,
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        if (response.ok) {
            imageUrl = (await response.json()).url;
        } else {
            alert('图片上传失败！');
            return;
        }
    }

    // 处理时间戳
    const isTimeUnknown = timeUnknownCheckbox.checked;
    const timestamp = isTimeUnknown ? null : new Date(timestampInput.value).toISOString();

    // 准备线索数据
    const data = {
        title: document.getElementById('clue-title').value,
        content: document.getElementById('clue-content').value,
        image: imageUrl,
        timestamp: timestamp
    };

    // 完成后的操作
    const onComplete = (updatedClue) => {
        if (id) {
            // 更新现有节点
            const clueNode = clues[id];
            if (clueNode) {
                // 更新本地数据
                clueNode.data = updatedClue;
                // 重新渲染该节点
                renderClue(updatedClue);
                // 更新连接线
                renderAllLines();
            }
        } else {
            // 新建节点时需要重新获取所有数据，因为新节点的ID是服务器生成的
            api.getClues().then(allClues => {
                canvas.innerHTML = '';
                clues = {};
                allClues.forEach(renderClue);
                renderAllLines();
            });
        }
        hideClueModal();
    };

    // 根据是否有ID决定是更新还是创建
    if (id) {
        api.updateClue(id, data).then(response => {
            // 获取更新后的线索数据
            api.getClues().then(allClues => {
                const updatedClue = allClues.find(clue => clue.id == id);
                if (updatedClue) {
                    onComplete(updatedClue);
                } else {
                    console.error('无法找到更新后的线索数据');
                    alert('更新线索后无法获取最新数据，请刷新页面');
                    hideClueModal();
                }
            });
        }).catch(error => {
            console.error('更新线索失败:', error);
            alert('更新线索失败: ' + (error.message || '未知错误'));
        });
    } else {
        data.pos_x = lastMousePos.x;
        data.pos_y = lastMousePos.y;
        api.createClue(data).then(onComplete);
    }
}

/**
 * 处理导入文件选择事件，接收到一份新的线索档案
 * 读取选中的文件并尝试导入数据
 * 
 * @param {Event} e - 文件选择事件对象
 */
async function handleImportFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (confirm('您确定吗？这将覆盖所有当前数据。')) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/data/import', { 
            method: 'POST', 
            body: formData,
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        if (response.ok) {
            alert('导入成功！');
            location.reload();
        } else {
            alert(`导入失败: ${(await response.json()).error}`);
        }
    }
    e.target.value = '';
}

    // --- Initialization ---
    /**
 * 初始化应用程序，进入办公室后准备好所有工具和资料
 * 设置所有必要的功能和加载初始数据
 */
async function init() {
    const status = await api.getStatus();
    isAdmin = status.logged_in;

    // 初始化Panzoom功能，允许所有用户移动视角
    initializePanzoom();

    // 如果是管理员，设置管理员功能
    if (isAdmin) {
        setupAdminFeatures();
    }

    const allClues = await api.getClues();
    allClues.forEach(renderClue);
    renderAllLines();
}

/**
 * 设置管理员功能，为Admin准备特殊工具
 * 包括拖拽线索、右键菜单、导入导出等高级功能
 */
function setupAdminFeatures() {
    let updateScheduled = false;
    
    /**
     * 安排连接线更新，避免频繁更新影响性能
     */
    function scheduleLineUpdate() {
        if (!updateScheduled) {
            updateScheduled = true;
            requestAnimationFrame(() => {
                lines.forEach(l => l.line.position());
                updateAllHitboxPositions();
                updateScheduled = false;
            });
        }
    }
    
    // 设置线索节点可拖拽
    interact('.clue-node').draggable({
        listeners: {
            start(event) {
                if (pz) pz.pause(); // 暂停缩放平移功能
            },
            move(event) {
                if (isConnecting) return; // 连接模式下不能拖拽
                const target = event.target;
                const transform = pz.getTransform();
                
                // 计算新位置，考虑缩放比例
                const x = (parseFloat(target.getAttribute('data-x')) || 0) + (event.dx / transform.scale);
                const y = (parseFloat(target.getAttribute('data-y')) || 0) + (event.dy / transform.scale);

                target.style.left = `${x}px`;
                target.style.top = `${y}px`;
                target.setAttribute('data-x', x);
                target.setAttribute('data-y', y);
                
                scheduleLineUpdate(); // 安排连接线更新
            },
            end(event) {
                if (isConnecting) return;
                if (pz) pz.resume(); // 恢复缩放平移功能
                const target = event.target;
                const id = parseInt(target.id.split('-')[1]);
                const data = {
                    pos_x: parseFloat(target.getAttribute('data-x')),
                    pos_y: parseFloat(target.getAttribute('data-y'))
                };
                api.updateClue(id, data); // 保存新位置到服务器
            }
        }
    });

    // 设置右键菜单事件
    board.addEventListener('contextmenu', handleBoardRightClick);
    contextMenu.addEventListener('click', handleContextMenuClick);
    document.addEventListener('click', (e) => {
        if (contextMenuVisible && !contextMenu.contains(e.target)) {
            hideContextMenu(); // 点击其他区域隐藏菜单
        }
    });
    importFileInput.addEventListener('change', handleImportFileSelect);
}

    // --- Form Submissions ---
    clueForm.addEventListener('submit', handleClueFormSubmit);
    
    document.getElementById('cancel-clue-modal').addEventListener('click', hideClueModal);
    
    // Kick off the application
    init();
});