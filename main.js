document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log("SEBITAM v5.3 Loaded");
        // DOM Elements
        const loginForm = document.getElementById('login-form');
        const loginScreen = document.getElementById('login-screen');
        const dashboardScreen = document.getElementById('dashboard-screen');
        if (!loginForm || !loginScreen || !dashboardScreen) {
            throw new Error('Elementos do login não encontrados. Limpe o cache (Ctrl+Shift+Del) e recarregue.');
        }
        const themeButtons = document.querySelectorAll('.theme-btn');
        const logoutBtn = document.getElementById('logout-btn');

        const userNameEl = document.getElementById('user-name');
        const userRoleEl = document.getElementById('user-role');
        const navItems = document.querySelectorAll('.nav-item');

        // State
        let currentUser = {
            role: 'admin',
            name: 'Administrador',
            loginType: 'sebitam'
        };
        // Navigation History
        let viewHistory = [];
        let currentView = 'login';
        let currentData = null;

        // --- CONFIGURAÇÃO SUPABASE ---
        // Usando configuração do arquivo externo (supabase-config.js)
        const SUPABASE_URL = window.SUPABASE_CONFIG?.url || "https://vwruogwdtbsareighmoc.supabase.co";
        const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey || "";

        // Inicialização do Cliente Supabase
        let supabase = null;
        try {
            // Validar se a chave foi configurada (aceita tanto eyJ quanto sb_publishable)
            const isKeyConfigured = SUPABASE_ANON_KEY &&
                SUPABASE_ANON_KEY !== "COLE_AQUI_SUA_CHAVE_ANON_DO_SUPABASE" &&
                (SUPABASE_ANON_KEY.startsWith('eyJ') || SUPABASE_ANON_KEY.startsWith('sb_'));

            if (!isKeyConfigured) {
                console.warn("⚠️ SUPABASE NÃO CONFIGURADO! Edite supabase-config.js e cole sua chave anon.");
                console.warn("📖 Instruções: Acesse Supabase Dashboard > Settings > API > copie 'anon public'");
                console.warn("🔄 Usando modo offline (localStorage) temporariamente.");
            } else if (window.supabase && typeof window.supabase.createClient === 'function') {
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.log("✅ Supabase inicializado com sucesso!");
                console.log("📡 Conectado ao projeto:", SUPABASE_URL.replace('https://', ''));
            } else {
                console.warn("⚠️ SDK do Supabase não encontrado. Usando modo offline (localStorage).");
            }
        } catch (err) {
            console.error("❌ Erro crítico ao inicializar Supabase:", err);
            console.warn("🔄 Usando modo offline (localStorage).");
        }

        // Mapping frontend collection names to Supabase table names (conforme tabelas no seu projeto)
        const tableMap = {
            'sebitam-students': 'estudantes',
            'sebitam-teachers': 'professores',
            'sebitam-admins': 'administradores',
            'sebitam-secretaries': 'secretarias'
        };

        // Mapping frontend fields to Supabase fields (for students)
        function mapToSupabase(item, collectionName) {
            if (!item) return item;
            const mappedTable = tableMap[collectionName];
            if (mappedTable === 'estudantes') {
                // Tabela no Supabase usa colunas em inglês (full_name, module, grade, plan) - ver PERMISSOES-SCHEMA-PUBLIC.sql
                const fullName = item.fullName ?? item.full_name ?? item['nome completo'] ?? item.nome_completo;
                const moduleVal = item.module ?? item.módulo ?? item.modulo;
                const gradeVal = item.grade ?? item.nota;
                const planVal = item.plan ?? item.plano;
                const mapped = {};
                if (fullName != null && fullName !== '') mapped.full_name = String(fullName);
                if (moduleVal != null) mapped.module = parseInt(moduleVal, 10) || 1;
                if (gradeVal != null) mapped.grade = parseInt(gradeVal, 10) || 1;
                if (planVal != null && planVal !== '') mapped.plan = String(planVal);
                if (item.email !== undefined) mapped.email = item.email;
                if (item.phone !== undefined) mapped.phone = item.phone;
                if (item.subjectGrades !== undefined) mapped.subject_grades = item.subjectGrades;
                if (item.subjectFreqs !== undefined) mapped.subject_freqs = item.subjectFreqs;
                if (item.paymentStatus !== undefined) mapped.payment_status = item.paymentStatus;
                return mapped;
            }
            return item; // For others, assume direct mapping or handle as needed
        }

        // Para tabela estudantes: pega valor tentando várias chaves possíveis (Supabase pode retornar nomes diferentes)
        function getEstudanteField(item, nameVariants) {
            for (const key of nameVariants) {
                const v = item[key];
                if (v !== undefined && v !== null && v !== '') return v;
            }
            const targets = nameVariants.map(v => v.toLowerCase().replace(/\s/g, '').replace(/[óô]/g, 'o'));
            for (const k of Object.keys(item || {})) {
                const kNorm = k.toLowerCase().replace(/\s/g, '').replace(/\u00a0/g, '').replace(/[óô]/g, 'o');
                if (targets.some(t => kNorm === t || kNorm.includes(t) || t.includes(kNorm))) return item[k];
            }
            return undefined;
        }

        function mapFromSupabase(item, collectionName) {
            if (!item) return item;
            const mappedTable = tableMap[collectionName];
            if (mappedTable === 'estudantes') {
                // Coluna no Supabase: "nome completo" (com espaço) - tentar essa chave primeiro e variantes
                const fullName = (item['nome completo'] != null && item['nome completo'] !== '')
                    ? String(item['nome completo'])
                    : (getEstudanteField(item, ['nome_completo', 'full_name', 'fullName']) ?? 'Aluno Sem Nome');
                const moduleVal = getEstudanteField(item, ['módulo', 'modulo', 'module']) ?? 1;
                const gradeVal = getEstudanteField(item, ['nota', 'grade']) ?? 1;
                const planVal = getEstudanteField(item, ['plano', 'plan']) ?? 'integral';
                return {
                    id: item.id,
                    fullName: String(fullName),
                    module: typeof moduleVal === 'number' ? moduleVal : (parseInt(moduleVal) || 1),
                    grade: typeof gradeVal === 'number' ? gradeVal : (parseInt(gradeVal) || 1),
                    plan: String(planVal),
                    email: item.email || '',
                    phone: item.phone || '',
                    subjectGrades: item.subject_grades || {},
                    subjectFreqs: item.subject_freqs || {},
                    paymentStatus: item.payment_status ?? null
                };
            }
            return item;
        }

        // Detecta erro de rede (Supabase inacessível)
        function isNetworkError(e) {
            const msg = (e && e.message) || '';
            return msg.includes('fetch') || msg.includes('NetworkError') || (e && e.name === 'TypeError' && msg.toLowerCase().includes('fetch'));
        }

        // Safe parsing helper para localStorage
        function safeLocalGet(key) {
            try {
                const val = localStorage.getItem(key);
                if (!val || val === 'undefined' || val === 'null') return [];
                const parsed = JSON.parse(val);
                return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
            } catch (e) {
                console.warn(`Erro no parse de ${key}:`, e);
                return [];
            }
        }

        // Database Helpers (Abstraction layer for Supabase)
        async function dbGet(collectionName) {
            const table = tableMap[collectionName] || collectionName;
            if (!supabase) return safeLocalGet(collectionName);
            try {
                console.log(`dbGet: Buscando dados de ${table}...`);
                const { data, error } = await supabase.from(table).select('*');
                if (error) {
                    console.error(`dbGet Erro (${table}):`, error);
                    throw error;
                }
                if (!data) return [];
                console.log(`dbGet: ${data.length} registros encontrados em ${table}`);
                if (table === 'estudantes' && data.length > 0) console.log('Supabase estudantes (1ª linha, chaves):', Object.keys(data[0]), 'Exemplo:', data[0]);
                return data.map(item => mapFromSupabase(item, collectionName));
            } catch (e) {
                console.error("Error fetching from Supabase fallback:", e);
                if (isNetworkError(e)) console.warn("⚠️ Sem conexão com Supabase. Usando dados locais.");
                return safeLocalGet(collectionName);
            }
        }

        // dbGet com timeout - evita login travar se Supabase demorar
        async function dbGetWithTimeout(collectionName, ms = 4000) {
            try {
                return await Promise.race([
                    dbGet(collectionName),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
                ]);
            } catch (_) {
                return safeLocalGet(collectionName);
            }
        }

        async function dbAddItem(collectionName, item) {
            const table = tableMap[collectionName] || collectionName;

            // Modo offline (localStorage)
            if (!supabase) {
                console.log(`💾 Salvando em localStorage: ${collectionName}`);
                const list = await dbGet(collectionName);
                // Ensure ID is present for localStorage fallback
                if (!item.id) item.id = Date.now();
                list.push(item);
                localStorage.setItem(collectionName, JSON.stringify(list));
                console.log(`✅ Salvo no localStorage com ID: ${item.id}`);
                return { success: true, id: item.id };
            }

            // Modo online (Supabase)
            try {
                // For students, we let Supabase generate the ID
                // For others, if the table has an auto-increment ID, we should remove our temporary ID
                const itemToInsert = { ...item };
                if (tableMap[collectionName] === 'estudantes' || itemToInsert.id) {
                    delete itemToInsert.id;
                }

                const mapped = mapToSupabase(itemToInsert, collectionName);
                console.log(`💾 Salvando em Supabase (${table}):`, mapped);

                const { data, error } = await supabase.from(table).insert([mapped]).select();

                if (error) {
                    console.error(`❌ Erro ao salvar em ${table}:`, error);
                    alert(`Erro ao salvar no banco de dados: ${error.message || 'Erro desconhecido'}`);
                    throw error;
                }

                console.log(`✅ Salvo com sucesso em ${table}!`, data);
                return { success: true, data: data };
            } catch (e) {
                if (isNetworkError(e)) {
                    console.warn("⚠️ Sem conexão com Supabase. Salvando localmente.");
                    const list = await dbGet(collectionName);
                    if (!item.id) item.id = Date.now();
                    list.push(item);
                    localStorage.setItem(collectionName, JSON.stringify(list));
                    alert("Sem conexão com o servidor. Dados salvos localmente e serão enviados quando a conexão voltar.");
                    return { success: true, id: item.id };
                }
                console.error(`❌ Erro crítico ao salvar em ${table}:`, e);
                throw e;
            }
        }

        async function dbUpdateItem(collectionName, id, updates) {
            const table = tableMap[collectionName] || collectionName;

            // Modo offline (localStorage)
            if (!supabase) {
                console.log(`💾 Atualizando em localStorage: ${collectionName}, ID: ${id}`);
                const list = await dbGet(collectionName);
                const idx = list.findIndex(i => String(i.id) === String(id));
                if (idx !== -1) {
                    list[idx] = { ...list[idx], ...updates };
                    localStorage.setItem(collectionName, JSON.stringify(list));
                    console.log(`✅ Atualizado no localStorage!`);
                    return { success: true };
                } else {
                    console.warn(`⚠️ Item não encontrado no localStorage: ID ${id}`);
                    return { success: false, error: 'Item não encontrado' };
                }
            }

            // Modo online (Supabase)
            try {
                const mapped = mapToSupabase(updates, collectionName);
                // Supabase often expects numeric IDs for integer primary keys
                const queryId = isNaN(id) ? id : parseInt(id);

                console.log(`💾 Atualizando em Supabase (${table}), ID: ${queryId}:`, mapped);

                const { data, error } = await supabase.from(table).update(mapped).eq('id', queryId).select();

                if (error) {
                    console.error(`❌ Erro ao atualizar em ${table}:`, error);
                    alert(`Erro ao atualizar no banco de dados: ${error.message || 'Erro desconhecido'}`);
                    throw error;
                }

                console.log(`✅ Atualizado com sucesso em ${table}!`, data);
                return { success: true, data: data };
            } catch (e) {
                if (isNetworkError(e)) {
                    const list = await dbGet(collectionName);
                    const idx = list.findIndex(i => String(i.id) === String(id));
                    if (idx !== -1) {
                        list[idx] = { ...list[idx], ...updates };
                        localStorage.setItem(collectionName, JSON.stringify(list));
                        alert("Sem conexão. Atualização salva localmente.");
                        return { success: true };
                    }
                }
                console.error(`❌ Erro crítico ao atualizar em ${table}:`, e);
                throw e;
            }
        }

        async function dbDeleteItem(collectionName, id) {
            const table = tableMap[collectionName] || collectionName;

            // Modo offline (localStorage)
            if (!supabase) {
                console.log(`🗑️ Excluindo de localStorage: ${collectionName}, ID: ${id}`);
                const list = await dbGet(collectionName);
                const filtered = list.filter(i => String(i.id) !== String(id));
                localStorage.setItem(collectionName, JSON.stringify(filtered));
                console.log(`✅ Excluído do localStorage!`);
                return { success: true };
            }

            // Modo online (Supabase)
            try {
                // Use numeric ID if possible to avoid type mismatch with SERIAL columns
                const queryId = isNaN(id) ? id : parseInt(id);

                console.log(`🗑️ Excluindo de Supabase (${table}), ID: ${queryId}`);

                const { data, error } = await supabase.from(table).delete().eq('id', queryId).select();

                if (error) {
                    console.error(`❌ Erro ao excluir de ${table}:`, error);
                    alert(`Erro ao excluir do banco de dados: ${error.message || 'Erro desconhecido'}`);
                    throw error;
                }

                console.log(`✅ Excluído com sucesso de ${table}!`, data);
                return { success: true, data: data };
            } catch (e) {
                if (isNetworkError(e)) {
                    const list = await dbGet(collectionName);
                    const filtered = list.filter(i => String(i.id) !== String(id));
                    localStorage.setItem(collectionName, JSON.stringify(filtered));
                    alert("Sem conexão. Exclusão aplicada localmente.");
                    return { success: true };
                }
                console.error(`❌ Erro crítico ao excluir de ${table}:`, e);
                throw e;
            }
        }

        // Role Mapping
        const roleDetails = {
            admin: { name: 'Diretoria SEBITAM', label: 'Administrador' },
            secretary: { name: 'Secretaria Acadêmica', label: 'Secretaria' },
            teacher: { name: 'Corpo Docente', label: 'Professor' },
            student: { name: 'Acesso Aluno', label: 'Aluno' }
        };

        // Theme Logic
        function applySavedTheme() {
            const savedTheme = localStorage.getItem('sebitam-theme') || 'professional';
            document.body.classList.remove('theme-man', 'theme-woman', 'theme-professional', 'theme-elegant');
            document.body.classList.add(`theme-${savedTheme}`);
        }

        function setLoginTheme() {
            document.body.classList.remove('theme-man', 'theme-woman', 'theme-professional', 'theme-elegant');
            document.body.classList.add('theme-man');
        }

        // Inicialmente, manter o tema preto para o login
        setLoginTheme();

        // Login Type Selector
        const loginTypeInput = document.getElementById('login-type');
        document.querySelectorAll('.login-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.login-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (loginTypeInput) loginTypeInput.value = btn.dataset.loginType;
                if (window.lucide) window.lucide.createIcons();
            });
        });

        // Login Logic
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const loginEmail = (document.getElementById('login-email')?.value || '').trim().toLowerCase().replace(/\s/g, '');
            let loginName = (document.getElementById('login-name')?.value || '').trim();
            const loginType = (document.getElementById('login-type') || {}).value || 'sebitam';

            if (!loginEmail) {
                alert('Digite seu e-mail.');
                return;
            }
            if (!loginName) loginName = 'Usuário'; // Nome opcional

            currentUser.email = loginEmail;
            currentUser.name = loginName;
            currentUser.loginType = loginType;
            let userFound = false;

            try {
                // ⭐ SUPER ADMIN — Prioridade máxima em SEBITAM e Escolas IBMA
                const SUPER_ADMIN_EMAILS = ['edukadoshmda@gmail.com'];
                const isSuperAdmin = SUPER_ADMIN_EMAILS.some(em => em.trim().toLowerCase() === loginEmail);
                if (isSuperAdmin) {
                    currentUser.role = 'admin';
                    currentUser.name = loginName || 'Administrador';
                    currentUser.loginType = loginType; // mantém o tipo de login escolhido
                    currentUser.isSuperAdmin = true;
                    userFound = true;
                    console.log('✅ Super Admin autenticado:', loginEmail, '| Login:', loginType);
                }

                // PRIORIDADE: Quem está cadastrado como admin, professor ou secretário no SEBITAM
                // (só se NÃO entrou pelo login IBMA)
                if (!userFound) {
                    const staffTables = [
                        { key: 'sebitam-admins', role: 'admin' },
                        { key: 'sebitam-secretaries', role: 'secretary' },
                        { key: 'sebitam-teachers', role: 'teacher' }
                    ];
                    for (const t of staffTables) {
                        const data = await dbGetWithTimeout(t.key);
                        const match = data.find(u => (u.email && u.email.toLowerCase() === loginEmail));
                        if (match) {
                            currentUser.role = t.role;
                            currentUser.name = match.fullName || match.name || loginName;
                            currentUser.id = match.id;
                            currentUser.photo = match.photo || null;
                            currentUser.loginType = 'sebitam';
                            userFound = true;
                            break;
                        }
                    }
                }

                // Se não é staff, verificar alunos (apenas no Login SEBITAM)
                if (!userFound && loginType !== 'escolas-ibma') {
                    const students = await dbGetWithTimeout('sebitam-students');
                    const match = students.find(u => (u.email && u.email.toLowerCase() === loginEmail));
                    if (match) {
                        currentUser.role = 'student';
                        currentUser.name = match.fullName || match.name || loginName;
                        currentUser.id = match.id;
                        currentUser.photo = match.photo || null;
                        currentUser.grade = match.grade || 1;
                        userFound = true;
                    }
                }

                // Login Escolas IBMA: verificar professores cadastrados
                if (!userFound && loginType === 'escolas-ibma') {
                    const profsIbma = safeLocalGet('professores-escolas-ibma');
                    const matchProf = profsIbma.find(p => p.email && p.email.toLowerCase() === loginEmail);
                    if (matchProf) {
                        currentUser.role = 'teacher';
                        currentUser.name = matchProf.fullName || matchProf.name || loginName;
                        currentUser.id = matchProf.id;
                        currentUser.loginType = 'escolas-ibma';
                        userFound = true;
                    }
                }

                // Login Escolas IBMA: quem não é staff cadastrado entra como aluno
                if (!userFound && loginType === 'escolas-ibma') {
                    userFound = true;
                    currentUser.role = 'student';
                }
            } catch (err) {
                console.error("Erro ao verificar usuário no banco:", err);
            }

            if (!userFound) {
                currentUser.role = 'student';
                currentUser.grade = 1;
            }

            try {
                // Troca de tela IMEDIATA (feedback visual antes de renderView)
                if (loginScreen) loginScreen.classList.remove('active');
                if (dashboardScreen) dashboardScreen.classList.add('active');
                if (refreshUIPermissions) refreshUIPermissions(currentUser.role);
                if (applySavedTheme) applySavedTheme();
                if (window.lucide) window.lucide.createIcons();
                document.body.classList.toggle('login-escolas-ibma', currentUser.loginType === 'escolas-ibma');
                document.body.classList.toggle('super-admin-ibma', !!(currentUser.loginType === 'escolas-ibma' && currentUser.isSuperAdmin));
                const overviewLabel = document.getElementById('nav-overview-label');
                if (overviewLabel) overviewLabel.textContent = (currentUser.loginType === 'escolas-ibma' && !currentUser.isSuperAdmin) ? 'Cadastro de Professores e Alunos' : 'Visão Geral';
                const brandText = document.getElementById('sidebar-brand-text');
                if (brandText) brandText.textContent = currentUser.loginType === 'escolas-ibma' ? 'Escola IBMA' : 'SEBITAM';

                if (currentUser.loginType === 'escolas-ibma') {
                    await renderView('overview');
                } else if (userFound) {
                    await renderView('overview');
                } else {
                    await renderView('enrollment');
                }
            } catch (err) {
                console.error('Erro ao entrar:', err);
                alert('Erro ao entrar. Recarregue a página (Ctrl+F5) e tente de novo.');
                if (loginScreen) loginScreen.classList.add('active');
                if (dashboardScreen) dashboardScreen.classList.remove('active');
            }
        });

        // Logout Logic

        const handleLogout = () => {
            if (dashboardScreen) dashboardScreen.classList.remove('active');
            if (loginScreen) loginScreen.classList.add('active');
            setLoginTheme();
            currentUser.loginType = 'sebitam';
            currentUser.isSuperAdmin = false;
            document.body.classList.remove('login-escolas-ibma', 'super-admin-ibma');
            const overviewLabel = document.getElementById('nav-overview-label');
            if (overviewLabel) overviewLabel.textContent = 'Visão Geral';
            const brandText = document.getElementById('sidebar-brand-text');
            if (brandText) brandText.textContent = 'SEBITAM';
            // Clear all role-specific classes from body
            document.body.classList.remove('user-role-admin', 'user-role-secretary', 'user-role-teacher', 'user-role-student');

            // Reset History
            viewHistory = [];
            currentView = 'login';
            currentData = null;
        };

        logoutBtn.addEventListener('click', handleLogout);
        const headerLogoutBtn = document.getElementById('header-logout-btn');
        if (headerLogoutBtn) {
            headerLogoutBtn.addEventListener('click', handleLogout);
        }



        // Header Back Button Logic
        const headBackBtn = document.getElementById('back-btn');
        if (headBackBtn) {
            headBackBtn.addEventListener('click', () => {
                if (viewHistory.length > 0) {
                    const lastState = viewHistory.pop();
                    renderView(lastState.view, lastState.data, false);
                } else {
                    renderView('overview', null, false);
                }
            });
        }

        // Nav Item Clicks
        navItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                if (item.classList.contains('external-nav')) return;
                e.preventDefault();
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');

                // Mobile: Close sidebar on selection
                const sidebar = document.getElementById('sidebar');
                const overlay = document.getElementById('sidebar-overlay');
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                    overlay.classList.remove('active');
                }

                const view = item.getAttribute('data-view');
                await renderView(view);
            });
        });

        // Mobile Menu Logic
        const menuToggle = document.getElementById('menu-toggle');
        const sidebarClose = document.getElementById('sidebar-close');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const sidebar = document.getElementById('sidebar');

        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.add('active');
                sidebarOverlay.classList.add('active');
            });
        }

        if (sidebarClose) {
            sidebarClose.addEventListener('click', () => {
                sidebar.classList.remove('active');
                sidebarOverlay.classList.remove('active');
            });
        }

        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                sidebar.classList.remove('active');
                sidebarOverlay.classList.remove('active');
            });
        }

        function refreshUIPermissions(role) {
            const rd = roleDetails[role] || roleDetails.student;
            if (userNameEl) userNameEl.textContent = currentUser.name || 'Usuário';
            if (userRoleEl) userRoleEl.textContent = rd.label;

            // Update Avatar
            if (window.updateAvatarUI) {
                window.updateAvatarUI(currentUser);
            }

            // Remove all previous role classes from body
            document.body.classList.remove('user-role-admin', 'user-role-secretary', 'user-role-teacher', 'user-role-student');
            document.body.classList.add(`user-role-${role}`);

            // Re-trigger lucide to ensure icons show on updated elements
            if (window.lucide) window.lucide.createIcons();
        }

        const subjectMap = {
            1: { title: 'Módulo 1: Fundamentos', subs: ['Bibliologia', 'Teontologia', 'Introdução N.T', 'Introdução A.T'] },
            2: { title: 'Módulo 2: Contexto Histórico', subs: ['Geografia Bíblica', 'Hermenêutica', 'Período Inter bíblico', 'Ética Cristã'] },
            3: { title: 'Módulo 3: Doutrinas Específica', subs: ['Soteriologia', 'Eclesiologia', 'Escatologia', 'Homilética'] },
            4: { title: 'Módulo 4: Teologia Aplicada', subs: ['Teologia Contemporânea', 'In. T. Bíblica A.T', 'In. T. Bíblica N.T', 'Teologia Pastoral'] },
            5: { title: 'Módulo 5: Prática Pastoral', subs: ['Exegese Bíblica', 'Psicologia Pastoral'] },
        };

        async function generateCertificate(studentId) {
            console.log("Gerando certificado para ID:", studentId);
            const students = await dbGet('sebitam-students');
            const student = students.find(item => String(item.id) === String(studentId));
            if (!student) {
                alert('Erro: Aluno não encontrado para gerar certificado (ID: ' + studentId + ')');
                return;
            }

            // Gerar matrícula automática se não existir
            if (!student.enrollment) {
                const enrollmentNumber = `SEBITAM-${String(student.id).padStart(4, '0')}`;
                student.enrollment = enrollmentNumber;
                await dbUpdateItem('sebitam-students', studentId, { enrollment: enrollmentNumber });
            }

            const printWindow = window.open('', '_blank');
            if (!printWindow) return alert('Por favor, libere os pop-ups para imprimir o certificado.');
            printWindow.document.write(`
            <html>
                <head>
                    <title>Certificado - ${student.fullName}</title>
                    <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Playfair+Display:wght@700&family=Montserrat:wght@400;700&display=swap" rel="stylesheet">
                    <style>
                        @page { size: A4 landscape; margin: 0; }
                        body { margin: 0; font-family: 'Montserrat', sans-serif; }
                        .certificate { width: 297mm; height: 210mm; background: white; border: 25px solid #1a365d; box-sizing: border-box; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 50px; }
                        .inner-border { position: absolute; top: 5px; left: 5px; right: 5px; bottom: 5px; border: 5px solid #d4af37; pointer-events: none; }
                        .logo { height: 120px; margin-bottom: 20px; }
                        .cert-title { font-family: 'Playfair Display', serif; font-size: 5rem; color: #1a365d; margin: 10px 0; text-transform: uppercase; }
                        .student-name { font-family: 'Playfair Display', serif; font-size: 3.8rem; color: #d4af37; margin: 20px 0; border-bottom: 2px solid #1a365d; padding: 0 40px; white-space: nowrap; width: 95%; text-align: center; }
                        .enrollment { font-size: 0.9rem; color: #64748b; margin-top: 5px; font-weight: 600; }
                        .content { text-align: center; max-width: 85% }
                        .footer { width: 100%; display: flex; justify-content: space-around; margin-top: 50px; }
                        .sig-block { text-align: center; border-top: 1px solid #1a365d; width: 200px; padding-top: 5px; font-size: 0.8rem; }
                    </style>
                </head>
                <body>
                    <div class="certificate">
                        <div class="inner-border"></div>
                        <img src="logo.jpg" class="logo">
                        <h1 class="cert-title">Certificado</h1>
                        <div class="content">
                            <p>O Seminário Bíblico Teológico da Amazônia certifica que:</p>
                            <div class="student-name">${student.fullName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}</div>

                            <p>concluiu com excelente aproveitamento todas as exigências do <strong>CURSO MÉDIO EM TEOLOGIA</strong>.</p>
                        </div>
                        <div class="footer">
                            <div class="sig-block">SECRETÁRIA</div>
                            <div class="sig-block">PR. PRESIDENTE</div>
                            <div class="sig-block">COORDENADOR</div>
                        </div>
                    </div>
                    <script>
                        window.onload = () => {
                            const studentName = document.querySelector('.student-name');
                            const maxWidth = studentName.parentElement.offsetWidth * 0.95;
                            let fontSize = 3.8; // rem
                            
                            // Criar um elemento invisível para medir a largura real do texto
                            const measure = document.createElement('span');
                            measure.style.fontFamily = getComputedStyle(studentName).fontFamily;
                            measure.style.fontSize = fontSize + 'rem';
                            measure.style.whiteSpace = 'nowrap';
                            measure.style.visibility = 'hidden';
                            measure.style.position = 'absolute';
                            measure.innerText = studentName.innerText;
                            document.body.appendChild(measure);

                            // Reduzir a fonte até que o texto caiba na largura máxima
                            while (measure.offsetWidth > maxWidth && fontSize > 1.5) {
                                fontSize -= 0.1;
                                measure.style.fontSize = fontSize + 'rem';
                            }
                            
                            studentName.style.fontSize = fontSize + 'rem';
                            document.body.removeChild(measure);

                            setTimeout(() => window.print(), 500);
                        };
                    </script>
                </body>
            </html>
        `);
            printWindow.document.close();
        }

        async function printAcademicHistory(studentId) {
            console.log("Gerando histórico para ID:", studentId);
            const students = await dbGet('sebitam-students');
            const student = students.find(item => String(item.id) === String(studentId));
            if (!student) {
                alert('Erro: Aluno não encontrado para o histórico (ID: ' + studentId + ')');
                return;
            }
            const printWindow = window.open('', '_blank');
            if (!printWindow) return alert('Por favor, libere os pop-ups para ver o histórico.');
            const nameCap = student.fullName.toUpperCase();
            const date = new Date().toLocaleDateString('pt-BR');

            printWindow.document.write(`
            <html>
                <head>
                    <title> </title>
                    <style>
                        @page { size: auto; margin: 0mm; }
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 15mm; color: #1e293b; line-height: 1.2; }
                        .header { text-align: center; border-bottom: 2px solid #1a365d; padding-bottom: 10px; margin-bottom: 15px; }
                        .logo { height: 132px; margin-bottom: 5px; }
                        h1 { color: #1a365d; margin: 0; font-size: 20px; text-transform: uppercase; }
                        .student-info { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                        th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
                        th { background: #1a365d; color: white; text-transform: uppercase; font-size: 10px; }
                        .module-row { background: #f1f5f9; font-weight: bold; color: #1a365d; font-size: 11px; }
                        .footer { margin-top: 20px; text-align: center; font-size: 11px; display: flex; justify-content: space-around; }
                        .signature { border-top: 1px solid #1a365d; width: 220px; padding-top: 3px; margin-top: 30px; }
                        .status-approved { color: #166534; font-weight: bold; }
                        .status-pending { color: #991b1b; font-weight: bold; }
                        @media print { button { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <img src="logo.jpg" class="logo">
                        <h1>Histórico Acadêmico Oficial</h1>
                        <p>Seminário Bíblico Teológico da Amazônia - SEBITAM</p>
                    </div>

                    <div class="student-info">
                        <div><strong>ALUNO(A):</strong> ${nameCap}</div>
                        <div><strong>CURSO:</strong> MÉDIO EM TEOLOGIA</div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Disciplina</th>
                                <th style="text-align:center; width: 35px;">Módulo</th>
                                <th style="text-align:center; width: 60px;">Nota</th>
                                <th style="text-align:center; width: 110px;">Carga Horária</th>
                                <th style="text-align:center; width: 100px;">Situação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(subjectMap).map(([module, data]) => {
                return `
                                    <tr class="module-row"><td colspan="5" style="padding: 4px 8px;">${data.title}</td></tr>
                                    ${data.subs.map(sub => {
                    const grade = (student.subjectGrades && student.subjectGrades[sub]) || '-';
                    const isApproved = grade >= 7;
                    const status = grade === '-' ? 'CURSANDO' : (isApproved ? 'APROVADO' : 'REPROVADO');

                    return `
                                            <tr>
                                                <td style="padding-right: 2px;">${sub}</td>
                                                <td style="text-align:center; width: 35px; padding-left: 0px; padding-right: 0px;">${module}</td>
                                                <td style="text-align:center"><strong>${grade}</strong></td>
                                                <td style="text-align:center">40h</td>
                                                <td class="${isApproved ? 'status-approved' : 'status-pending'}" style="text-align:center">${status}</td>
                                            </tr>
                                        `;
                }).join('')}
                                `;
            }).join('')}
                        </tbody>
                    </table>

                    <div class="footer">
                        <div class="signature">DIRETORIA ACADÊMICA</div>
                        <div class="signature">SECRETARIA GERAL</div>
                    </div>
                    <script>window.onload = () => setTimeout(() => window.print(), 500);</script>
                </body>
            </html>
        `);
            printWindow.document.close();
        }

        // Função para visualizar o histórico escolar de forma interativa
        async function viewAcademicHistory(studentId) {
            console.log("Abrindo histórico escolar para ID:", studentId);
            const students = await dbGet('sebitam-students');
            const student = students.find(item => String(item.id) === String(studentId));
            if (!student) {
                alert('Erro: Aluno não encontrado (ID: ' + studentId + ')');
                return;
            }

            const nameCap = student.fullName.toUpperCase();
            const today = new Date().toLocaleDateString('pt-BR');

            // Calcular totais
            let totalDisciplinas = 0;
            let totalAprovadas = 0;
            let somaNotas = 0;
            let countNotas = 0;

            Object.entries(subjectMap).forEach(([module, data]) => {
                data.subs.forEach(sub => {
                    totalDisciplinas++;
                    const grade = (student.subjectGrades && student.subjectGrades[sub]) || 0;
                    if (grade >= 7) totalAprovadas++;
                    if (grade > 0) {
                        somaNotas += parseFloat(grade);
                        countNotas++;
                    }
                });
            });

            const mediaGeral = countNotas > 0 ? (somaNotas / countNotas).toFixed(2) : '0.00';
            const percentualConclusao = ((totalAprovadas / totalDisciplinas) * 100).toFixed(1);

            const contentBody = document.getElementById('dynamic-content');
            contentBody.innerHTML = `
            <div class="view-header">
                <button class="btn-primary" id="back-to-classes" style="width: auto; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="arrow-left"></i> Voltar
                </button>
                <h2 style="display: flex; align-items: center; gap: 12px;">
                    <i data-lucide="file-text" style="width: 28px; height: 28px;"></i>
                    Histórico Escolar Completo
                </h2>
                <p style="color: var(--text-muted);">Visualização completa do histórico acadêmico</p>
            </div>

            <div style="background: white; padding: 30px; border-radius: 20px; box-shadow: var(--shadow); margin-bottom: 20px;">
                <!-- Cabeçalho do Aluno -->
                <div style="text-align: center; border-bottom: 2px solid var(--primary); padding-bottom: 20px; margin-bottom: 30px;">
                    <img src="logo.jpg" style="height: 80px; margin-bottom: 15px;">
                    <h3 style="color: var(--primary); margin: 10px 0; font-size: 1.5rem;">SEMINÁRIO BÍBLICO TEOL ÓGICO DA AMAZÔNIA</h3>
                    <p style="color: var(--text-muted); margin: 5px 0;">Curso Médio em Teologia</p>
                </div>

                <!-- Informações do Aluno -->
                <div style="background: linear-gradient(135deg, var(--primary), #1e40af); padding: 25px; border-radius: 15px; margin-bottom: 30px; color: white;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                        <div>
                            <label style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Aluno</label>
                            <div style="font-size: 1.2rem; font-weight: 700;">${nameCap}</div>
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Turma</label>
                            <div style="font-size: 1.2rem; font-weight: 700;">Turma ${student.grade || '-'}</div>
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Módulo Atual</label>
                            <div style="font-size: 1.2rem; font-weight: 700;">Módulo ${student.module || '-'}</div>
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Data de Emissão</label>
                            <div style="font-size: 1.2rem; font-weight: 700;">${today}</div>
                        </div>
                    </div>
                </div>

                <!-- Resumo Acadêmico -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 30px;">
                    <div style="background: rgba(37, 99, 235, 0.1); padding: 20px; border-radius: 12px; text-align: center; border: 2px solid rgba(37, 99, 235, 0.3);">
                        <div style="font-size: 2rem; font-weight: 800; color: var(--primary); margin-bottom: 5px;">${totalDisciplinas}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Total de Disciplinas</div>
                    </div>
                    <div style="background: rgba(34, 197, 94, 0.1); padding: 20px; border-radius: 12px; text-align: center; border: 2px solid rgba(34, 197, 94, 0.3);">
                        <div style="font-size: 2rem; font-weight: 800; color: #16a34a; margin-bottom: 5px;">${totalAprovadas}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Disciplinas Aprovadas</div>
                    </div>
                    <div style="background: rgba(234, 179, 8, 0.1); padding: 20px; border-radius: 12px; text-align: center; border: 2px solid rgba(234, 179, 8, 0.3);">
                        <div style="font-size: 2rem; font-weight: 800; color: #ca8a04; margin-bottom: 5px;">${mediaGeral}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Média Geral</div>
                    </div>
                    <div style="background: rgba(139, 92, 246, 0.1); padding: 20px; border-radius: 12px; text-align: center; border: 2px solid rgba(139, 92, 246, 0.3);">
                        <div style="font-size: 2rem; font-weight: 800; color: #7c3aed; margin-bottom: 5px;">${percentualConclusao}%</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Progresso do Curso</div>
                    </div>
                </div>

                <!-- Tabela de Disciplinas -->
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Disciplina</th>
                                <th style="text-align: center; width: 80px;">Módulo</th>
                                <th style="text-align: center; width: 80px;">Nota</th>
                                <th style="text-align: center; width: 100px;">Carga Horária</th>
                                <th style="text-align: center; width: 120px;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(subjectMap).map(([module, data]) => `
                                <tr style="background: #f1f5f9;">
                                    <td colspan="5" style="font-weight: 700; color: var(--primary); padding: 12px;">
                                        <i data-lucide="layers" style="width: 16px; height: 16px; margin-right: 8px;"></i>
                                        ${data.title}
                                    </td>
                                </tr>
                                ${data.subs.map(sub => {
                const grade = (student.subjectGrades && student.subjectGrades[sub]) || 0;
                const freq = (student.subjectFreqs && student.subjectFreqs[sub]) || 0;
                const isApproved = grade >= 7 && freq >= 75;
                const status = grade === 0 ? 'CURSANDO' : (isApproved ? 'APROVADO' : 'REPROVADO');
                const statusColor = grade === 0 ? '#94a3b8' : (isApproved ? '#16a34a' : '#dc2626');
                const statusBg = grade === 0 ? 'rgba(148, 163, 184, 0.1)' : (isApproved ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)');

                return `
                                        <tr>
                                            <td style="padding-left: 30px;">${sub}</td>
                                            <td style="text-align: center; font-weight: 600; color: var(--text-muted);">
                                                Módulo ${module}
                                            </td>
                                            <td style="text-align: center;">
                                                <strong style="font-size: 1.1rem; color: ${isApproved ? '#16a34a' : (grade === 0 ? '#94a3b8' : '#dc2626')};">
                                                    ${grade === 0 ? '-' : grade.toFixed(1)}
                                                </strong>
                                            </td>
                                            <td style="text-align: center; color: var(--text-muted);">40h</td>
                                            <td style="text-align: center;">
                                                <span style="background: ${statusBg}; color: ${statusColor}; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; border: 1px solid ${statusColor};">
                                                    ${status}
                                                </span>
                                            </td>
                                        </tr>
                                    `;
            }).join('')}
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Ações -->
                <div style="margin-top: 30px; display: flex; gap: 15px; justify-content: flex-end; flex-wrap: wrap;">
                    ${(currentUser.role === 'teacher' || currentUser.role === 'admin' || currentUser.role === 'secretary') ? `
                    <button onclick="renderGradeEditor('${studentId}')" class="btn-primary" style="display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="edit-3"></i>
                        Editar Notas e Frequências
                    </button>` : ''}
                    <button onclick="printAcademicHistory('${studentId}')" class="btn-primary" style="background: var(--secondary); display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="printer"></i>
                        Imprimir Histórico
                    </button>
                </div>
            </div>
        `;

            lucide.createIcons();
            document.getElementById('back-to-classes').onclick = () => renderView('classes');
        }

        // Função para editar/visualizar notas (Boletim)
        async function renderGradeEditor(studentId) {
            console.log("Abrindo editor de notas para ID:", studentId);
            const students = await dbGet('sebitam-students');
            const s = students.find(item => String(item.id) === String(studentId));
            if (!s) {
                alert('Erro: Aluno não encontrado (ID: ' + studentId + ')');
                return;
            }

            const moduleNum = s.module || 1;
            const subjects = subjectMap[moduleNum] ? subjectMap[moduleNum].subs : [];
            const contentBody = document.getElementById('dynamic-content');

            // Calcular média geral e situação
            let totalNotas = 0;
            let countNotas = 0;
            let totalFreq = 0;
            let countFreq = 0;

            Object.entries(subjectMap).forEach(([mod, data]) => {
                data.subs.forEach(sub => {
                    const grade = (s.subjectGrades && s.subjectGrades[sub]) || 0;
                    const freq = (s.subjectFreqs && s.subjectFreqs[sub]) || 0;
                    if (grade > 0) {
                        totalNotas += parseFloat(grade);
                        countNotas++;
                    }
                    if (freq > 0) {
                        totalFreq += parseFloat(freq);
                        countFreq++;
                    }
                });
            });

            const mediaGeral = countNotas > 0 ? (totalNotas / countNotas).toFixed(2) : '0.00';
            const mediaFreq = countFreq > 0 ? (totalFreq / countFreq).toFixed(1) : '0.0';
            const situacao = parseFloat(mediaGeral) >= 7 && parseFloat(mediaFreq) >= 75 ? 'APROVADO' : 'EM ANDAMENTO';
            const situacaoColor = situacao === 'APROVADO' ? '#16a34a' : '#eab308';

            contentBody.innerHTML = `
            <div class="view-header">
                <button class="btn-primary" id="back-to-classes" style="width: auto; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="arrow-left"></i> Voltar
                </button>
                <h2>${currentUser.role === 'student' ? 'Meu Boletim' : 'Lançamento de Notas'}: ${s.fullName.toUpperCase()}</h2>
                <p style="color: var(--text-muted);">
                    ${currentUser.role === 'student'
                    ? 'Visualize suas notas e frequência em todas as disciplinas'
                    : 'Edite as notas e frequências do aluno'}
                </p>
            </div>

            ${currentUser.role === 'student' ? `
                <div style="background: linear-gradient(135deg, ${situacaoColor}, ${situacao === 'APROVADO' ? '#059669' : '#ca8a04'}); padding: 25px; border-radius: 15px; margin-bottom: 30px; color: white; box-shadow: var(--shadow-lg);">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                        <div>
                            <label style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Média Geral</label>
                            <div style="font-size: 2rem; font-weight: 800;">${mediaGeral}</div>
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Frequência Média</label>
                            <div style="font-size: 2rem; font-weight: 800;">${mediaFreq}%</div>
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Situação</label>
                            <div style="font-size: 1.5rem; font-weight: 800;">${situacao}</div>
                        </div>
                    </div>
                </div>
            ` : ''}

            <div class="form-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Disciplina</th>
                            <th style="width: 100px; text-align: center;">Módulo</th>
                            <th style="width: 120px; text-align: center;">Nota (0-10)</th>
                            <th style="width: 120px; text-align: center;">Frequência %</th>
                            <th style="width: 100px; text-align: center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(subjectMap).map(([mNum, mData]) => `
                            <tr style="background: #f1f5f9; font-weight: bold;">
                                <td colspan="5" style="padding: 12px;">
                                    <i data-lucide="layers" style="width: 16px; height: 16px; margin-right: 8px;"></i>
                                    ${mData.title}
                                </td>
                            </tr>
                            ${mData.subs.map(sub => {
                        const grade = (s.subjectGrades && s.subjectGrades[sub]) || '';
                        const freq = (s.subjectFreqs && s.subjectFreqs[sub]) || '100';
                        const isApproved = parseFloat(grade) >= 7 && parseFloat(freq) >= 75;
                        const status = grade === '' ? '-' : (isApproved ? 'Aprovado' : 'Reprovado');
                        const statusColor = grade === '' ? '#94a3b8' : (isApproved ? '#16a34a' : '#dc2626');

                        return `
                                    <tr>
                                        <td>${sub}</td>
                                        <td style="font-size: 0.8rem; color: var(--text-muted); text-align: center;">Módulo ${mNum}</td>
                                        <td style="text-align: center;">
                                            <input 
                                                type="number" 
                                                class="table-input subject-grade" 
                                                data-subject="${sub}" 
                                                value="${grade}" 
                                                step="0.1" 
                                                min="0" 
                                                max="10" 
                                                ${currentUser.role === 'student' ? 'disabled' : ''}
                                                style="width: 80px; text-align: center; font-weight: 600; color: ${isApproved ? '#16a34a' : (grade === '' ? '#94a3b8' : '#dc2626')};"
                                            >
                                        </td>
                                        <td style="text-align: center;">
                                            <input 
                                                type="number" 
                                                class="table-input subject-freq" 
                                                data-subject="${sub}" 
                                                value="${freq}" 
                                                min="0" 
                                                max="100" 
                                                ${currentUser.role === 'student' ? 'disabled' : ''}
                                                style="width: 80px; text-align: center; font-weight: 600;"
                                            >
                                        </td>
                                        <td style="text-align: center;">
                                            <span style="color: ${statusColor}; font-weight: 700; font-size: 0.85rem;">
                                                ${status}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                    }).join('')}
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="form-actions" style="margin-top: 20px; display: flex; gap: 10px;">
                    ${currentUser.role !== 'student' ? '<button id="save-grades" class="btn-primary">Salvar Boletim</button>' : ''}
                    <button id="print-grades" class="btn-primary" style="background: var(--secondary);">
                        <i data-lucide="printer" style="width: 16px; height: 16px; margin-right: 8px;"></i>
                        Imprimir Histórico
                    </button>
                </div>
            </div>
        `;

            lucide.createIcons();
            document.getElementById('back-to-classes').onclick = () => renderView('classes');

            const saveBtn = document.getElementById('save-grades');
            if (saveBtn) {
                saveBtn.onclick = async () => {
                    const grades = {}, freqs = {};
                    document.querySelectorAll('.subject-grade').forEach(i => {
                        const val = i.value.trim();
                        grades[i.dataset.subject] = val === '' ? null : parseFloat(val);
                    });
                    document.querySelectorAll('.subject-freq').forEach(i => {
                        const val = i.value.trim();
                        freqs[i.dataset.subject] = val === '' ? null : parseFloat(val);
                    });

                    const success = await dbUpdateItem('sebitam-students', studentId, {
                        subjectGrades: grades,
                        subjectFreqs: freqs
                    });

                    if (success) {
                        alert('Boletim atualizado com sucesso!');
                        renderView('classes');
                    }
                };
            }
            document.getElementById('print-grades').onclick = () => printAcademicHistory(studentId);
        }

        // Expor funções no escopo global para serem acessíveis via onclick
        window.renderGradeEditor = renderGradeEditor;
        window.viewAcademicHistory = viewAcademicHistory;
        window.generateCertificate = generateCertificate;
        window.printAcademicHistory = printAcademicHistory;

        // Função para editar cadastro de aluno
        async function renderEditStudent(studentId) {
            console.log("Editando cadastro do aluno ID:", studentId);
            const students = await dbGet('sebitam-students');
            const s = students.find(item => String(item.id) === String(studentId));
            if (!s) {
                alert('Erro: Aluno não encontrado (ID: ' + studentId + ')');
                return;
            }

            const contentBody = document.getElementById('dynamic-content');
            contentBody.innerHTML = `
            <div class="view-header">
                <button class="btn-primary" id="back-to-classes" style="width: auto; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="arrow-left"></i> Voltar
                </button>
                <h2>Editar Cadastro: ${s.fullName}</h2>
                <p style="color: var(--text-muted);">Atualize as informações cadastrais do aluno</p>
            </div>

            <div class="form-container">
                <form id="edit-student-form">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Nome Completo</label>
                            <div class="input-field">
                                <i data-lucide="user"></i>
                                <input type="text" name="fullName" value="${s.fullName}" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Módulo (1 a 5)</label>
                            <div class="input-field">
                                <i data-lucide="layers"></i>
                                <select name="module" style="padding-left: 48px;">
                                    ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${s.module == n ? 'selected' : ''}>Módulo ${n}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Turma (1 a 10)</label>
                            <div class="input-field">
                                <i data-lucide="hash"></i>
                                <select name="grade" style="padding-left: 48px;">
                                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${s.grade == n ? 'selected' : ''}>Turma ${n}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Plano Financeiro</label>
                            <div class="input-field">
                                <i data-lucide="credit-card"></i>
                                <select name="plan" style="padding-left: 48px;">
                                    <option value="integral" ${s.plan === 'integral' ? 'selected' : ''}>Integral (R$ 70,00)</option>
                                    <option value="half" ${s.plan === 'half' ? 'selected' : ''}>Parcial (R$ 35,00)</option>
                                    <option value="scholarship" ${s.plan === 'scholarship' ? 'selected' : ''}>Bolsista</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>E-mail</label>
                            <div class="input-field">
                                <i data-lucide="mail"></i>
                                <input type="email" name="email" value="${s.email || ''}" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Telefone / WhatsApp</label>
                            <div class="input-field">
                                <i data-lucide="phone"></i>
                                <input type="tel" name="phone" value="${s.phone || ''}" required>
                            </div>
                        </div>
                    </div>
                    <div class="form-actions" style="margin-top: 20px;">
                        <button type="submit" class="btn-primary">Salvar Alterações</button>
                    </div>
                </form>
            </div>
        `;

            lucide.createIcons();
            document.getElementById('back-to-classes').onclick = () => renderView('classes');

            document.getElementById('edit-student-form').onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const updates = {
                    fullName: formData.get('fullName'),
                    module: parseInt(formData.get('module')),
                    grade: parseInt(formData.get('grade')),
                    plan: formData.get('plan'),
                    email: formData.get('email'),
                    phone: formData.get('phone')
                };

                await dbUpdateItem('sebitam-students', studentId, updates);
                alert('Cadastro atualizado com sucesso!');
                await renderView('classes');
            };
        }

        // Expor novas funções no escopo global
        window.renderEditStudent = renderEditStudent;

        // Função para imprimir boletim completo formatado
        async function printBoletim(studentId) {
            console.log("Gerando boletim completo para ID:", studentId);
            const students = await dbGet('sebitam-students');
            const s = students.find(item => String(item.id) === String(studentId));
            if (!s) {
                alert('Erro: Aluno não encontrado (ID: ' + studentId + ')');
                return;
            }

            const nameCap = s.fullName.toUpperCase();
            const today = new Date().toLocaleDateString('pt-BR');

            // Calcular média geral e frequência média
            let totalNotas = 0;
            let countNotas = 0;
            let totalFreq = 0;
            let countFreq = 0;

            Object.entries(subjectMap).forEach(([mod, data]) => {
                data.subs.forEach(sub => {
                    const grade = (s.subjectGrades && s.subjectGrades[sub]) || 0;
                    const freq = (s.subjectFreqs && s.subjectFreqs[sub]) || 0;
                    if (grade > 0) {
                        totalNotas += parseFloat(grade);
                        countNotas++;
                    }
                    if (freq > 0) {
                        totalFreq += parseFloat(freq);
                        countFreq++;
                    }
                });
            });

            const mediaGeral = countNotas > 0 ? (totalNotas / countNotas).toFixed(2) : '0.00';
            const mediaFreq = countFreq > 0 ? (totalFreq / countFreq).toFixed(1) : '0.0';

            const printWindow = window.open('', '_blank');
            if (!printWindow) return alert('Por favor, libere os pop-ups para visualizar o boletim.');

            printWindow.document.write(`
            <html>
                <head>
                    <title>Boletim Escolar - ${s.fullName}</title>
                    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
                    <style>
                        @page { size: A4; margin: 20mm; }
                        body { 
                            font-family: 'Montserrat', sans-serif; 
                            color: #1e293b; 
                            line-height: 1.6; 
                            margin: 0;
                            padding: 20px;
                        }
                        .header { 
                            text-align: center; 
                            border-bottom: 3px solid #2563eb; 
                            padding-bottom: 20px; 
                            margin-bottom: 30px; 
                        }
                        .logo { height: 80px; margin-bottom: 10px; }
                        h1 { 
                            color: #2563eb; 
                            margin: 10px 0; 
                            font-size: 24px; 
                            font-weight: 700;
                            text-transform: uppercase; 
                        }
                        h2 { 
                            color: #64748b; 
                            margin: 5px 0; 
                            font-size: 14px; 
                            font-weight: 600;
                        }
                        .student-info {
                            background: linear-gradient(135deg, #2563eb, #1e40af);
                            color: white;
                            padding: 20px;
                            border-radius: 10px;
                            margin-bottom: 25px;
                            display: grid;
                            grid-template-columns: repeat(2, 1fr);
                            gap: 15px;
                        }
                        .info-row {
                            padding: 8px 0;
                        }
                        .info-label {
                            font-size: 11px;
                            opacity: 0.8;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                            margin-bottom: 4px;
                        }
                        .info-value {
                            font-size: 16px;
                            font-weight: 700;
                        }
                        .summary-box {
                            display: grid;
                            grid-template-columns: repeat(2, 1fr);
                            gap: 15px;
                            margin-bottom: 25px;
                        }
                        .summary-card {
                            background: #f8fafc;
                            border: 2px solid #e2e8f0;
                            border-radius: 8px;
                            padding: 15px;
                            text-align: center;
                        }
                        .summary-value {
                            font-size: 28px;
                            font-weight: 800;
                            color: #2563eb;
                            margin-bottom: 5px;
                        }
                        .summary-label {
                            font-size: 11px;
                            color: #64748b;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 20px;
                            font-size: 13px;
                        }
                        th {
                            background: #2563eb;
                            color: white;
                            padding: 12px 10px;
                            text-align: left;
                            font-weight: 600;
                            text-transform: uppercase;
                            font-size: 11px;
                            letter-spacing: 0.5px;
                        }
                        td {
                            padding: 10px;
                            border-bottom: 1px solid #e2e8f0;
                        }
                        .module-row {
                            background: #f1f5f9 !important;
                            font-weight: 700;
                            color: #2563eb;
                            font-size: 14px;
                        }
                        .module-row td {
                            padding: 12px 10px;
                            border-bottom: 2px solid #cbd5e1;
                        }
                        tr:hover {
                            background: #f8fafc;
                        }
                        .status-aprovado {
                            color: #16a34a;
                            font-weight: 700;
                        }
                        .status-reprovado {
                            color: #dc2626;
                            font-weight: 700;
                        }
                        .status-cursando {
                            color: #94a3b8;
                            font-weight: 600;
                        }
                        .footer {
                            margin-top: 40px;
                            padding-top: 20px;
                            border-top: 2px solid #e2e8f0;
                            display: flex;
                            justify-content: space-between;
                            font-size: 11px;
                            color: #64748b;
                        }
                        @media print {
                            body { padding: 0; }
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <img src="logo.jpg" class="logo">
                        <h1>Boletim Escolar</h1>
                        <h2>Seminário Bíblico Teológico da Amazônia - SEBITAM</h2>
                    </div>

                    <div class="student-info">
                        <div class="info-row">
                            <div class="info-label">Aluno</div>
                            <div class="info-value">${nameCap}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Turma</div>
                            <div class="info-value">Turma ${s.grade || '-'}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Módulo Atual</div>
                            <div class="info-value">Módulo ${s.module || '-'}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Data de Emissão</div>
                            <div class="info-value">${today}</div>
                        </div>
                    </div>

                    <div class="summary-box">
                        <div class="summary-card">
                            <div class="summary-value">${mediaGeral}</div>
                            <div class="summary-label">Média Geral</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-value">${mediaFreq}%</div>
                            <div class="summary-label">Frequência Média</div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Disciplina</th>
                                <th style="text-align: center; width: 100px;">Módulo</th>
                                <th style="text-align: center; width: 80px;">Nota</th>
                                <th style="text-align: center; width: 100px;">Frequência</th>
                                <th style="text-align: center; width: 120px;">Carga Horária</th>
                                <th style="text-align: center; width: 100px;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(subjectMap).map(([module, data]) => {
                return `
                                    <tr class="module-row">
                                        <td colspan="6">
                                            ${data.title}
                                        </td>
                                    </tr>
                                    ${data.subs.map(sub => {
                    const grade = (s.subjectGrades && s.subjectGrades[sub]) || 0;
                    const freq = (s.subjectFreqs && s.subjectFreqs[sub]) || 100;
                    const isApproved = grade >= 7 && freq >= 75;
                    const status = grade === 0 ? 'CURSANDO' : (isApproved ? 'APROVADO' : 'REPROVADO');
                    const statusClass = grade === 0 ? 'status-cursando' : (isApproved ? 'status-aprovado' : 'status-reprovado');

                    return `
                                            <tr>
                                                <td style="padding-left: 25px;">${sub}</td>
                                                <td style="text-align: center; color: #64748b;">Módulo ${module}</td>
                                                <td style="text-align: center; font-weight: 700; font-size: 15px;">${grade === 0 ? '-' : grade.toFixed(1)}</td>
                                                <td style="text-align: center; font-weight: 600;">${freq}%</td>
                                                <td style="text-align: center; font-weight: 600; color: #2563eb;">40h</td>
                                                <td style="text-align: center;" class="${statusClass}">${status}</td>
                                            </tr>
                                        `;
                }).join('')}
                                `;
            }).join('')}
                        </tbody>
                    </table>

                    <div class="footer">
                        <div>
                            <strong>Emitido em:</strong> ${today}
                        </div>
                        <div>
                            <strong>Assinatura:</strong> _______________________________
                        </div>
                    </div>

                    <script>
                        window.onload = () => setTimeout(() => window.print(), 500);
                    </script>
                </body>
            </html>
        `);
            printWindow.document.close();
        }

        // Expor função no escopo global
        window.printBoletim = printBoletim;

        async function printFinancialReport(monthIndex, year) {
            console.log(`Gerando relatório financeiro: Mês ${monthIndex}, Ano ${year}`);
            const students = await dbGet('sebitam-students');
            const monthName = new Date(year, monthIndex).toLocaleString('pt-BR', { month: 'long' });
            const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);

            // Calcular totais
            const PRICES = { integral: 70, half: 35, scholarship: 0 };
            let totalExpected = 0;
            let totalReceived = 0;

            const reportData = students.map(s => {
                const status = s.paymentStatus || (['integral', 'scholarship'].includes(s.plan) ? 'Pago' : 'Pendente');
                const value = PRICES[s.plan] || 0;
                totalExpected += value;
                if (status === 'Pago') totalReceived += value;
                return { ...s, status, value };
            });

            const printWindow = window.open('', '_blank');
            if (!printWindow) return alert('Por favor, libere os pop-ups para imprimir o relatório.');

            const dateStr = new Date().toLocaleDateString('pt-BR');

            printWindow.document.write(`
            <html>
                <head>
                    <title>Relatório Financeiro - ${monthNameCap}/${year}</title>
                    <style>
                        @page { size: A4; margin: 15mm; }
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; line-height: 1.4; }
                        .header { text-align: center; border-bottom: 2px solid #1a365d; padding-bottom: 15px; margin-bottom: 20px; }
                        .logo { height: 80px; margin-bottom: 10px; }
                        h1 { color: #1a365d; margin: 5px 0; font-size: 24px; text-transform: uppercase; }
                        h2 { color: #64748b; margin: 0; font-size: 16px; font-weight: normal; }
                        .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 20px; display: flex; justify-content: space-around; }
                        .summary-item { text-align: center; }
                        .summary-val { display: block; font-size: 18px; font-weight: bold; color: #0f172a; }
                        .summary-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
                        table { width: 100%; border-collapse: collapse; font-size: 12px; }
                        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
                        th { background: #1a365d; color: white; text-transform: uppercase; font-size: 11px; }
                        tr:nth-child(even) { background-color: #f1f5f9; }
                        .status-pago { color: #166534; font-weight: bold; }
                        .status-pendente { color: #991b1b; font-weight: bold; }
                        .audit-info { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 5px; }
                        @media print { button { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <img src="logo.jpg" class="logo">
                        <h1>Relatório Financeiro Mensal</h1>
                        <h2>Referência: ${monthNameCap} de ${year}</h2>
                    </div>

                    <div class="summary-box">
                        <div class="summary-item">
                            <span class="summary-val">R$ ${totalExpected.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span class="summary-label">Previsão de Receita</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-val" style="color: #16a34a;">R$ ${totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span class="summary-label">Total Recebido</span>
                        </div>
                        <div class="summary-item">
                            <span class="summary-val" style="color: #dc2626;">R$ ${(totalExpected - totalReceived).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span class="summary-label">Inadimplência</span>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Aluno</th>
                                <th>Turma</th>
                                <th>Plano</th>
                                <th>Valor</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reportData.map(s => `
                                <tr>
                                    <td>${s.fullName}</td>
                                    <td>${s.grade || '-'}</td>
                                    <td>${s.plan === 'integral' ? 'Integral' : s.plan === 'half' ? 'Meia' : 'Bolsa'}</td>
                                    <td>R$ ${s.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td class="${s.status === 'Pago' ? 'status-pago' : 'status-pendente'}">${s.status.toUpperCase()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="audit-info">
                        Relatório gerado em ${dateStr} pelo usuário ${currentUser.name} (${currentUser.role}).<br>
                        Sistema de Gestão SEBITAM.
                    </div>
                    <script>window.onload = () => setTimeout(() => window.print(), 500);</script>
                </body>
            </html>
        `);
            printWindow.document.close();
        }

        async function renderView(view, data = null, addToHistory = true) {
            // Handle History
            if (addToHistory && currentView && currentView !== 'login' && currentView !== view) {
                viewHistory.push({ view: currentView, data: currentData });
            }
            currentView = view;
            currentData = data;

            // Header Back Button Logic
            const headBackBtn = document.getElementById('back-btn');
            const headMenuBtn = document.getElementById('menu-toggle');

            if (headBackBtn && headMenuBtn) {
                if (view === 'overview') {
                    headBackBtn.style.display = 'none';
                    headMenuBtn.style.display = 'flex'; // Show menu on home
                } else {
                    headBackBtn.style.display = 'flex';
                    // Optional: Hide menu button on deep pages if desired, user asked for back icon
                    // Keeping menu accessible is usually better, but let's prioritize the back button requested.
                    // headMenuBtn.style.display = 'none'; 
                }
            }

            const contentBody = document.getElementById('dynamic-content');
            let html = '';
            if (view === 'escolas-ibma') {
                view = 'overview';
            }
            switch (view) {
                case 'overview':
                    const students = await dbGetWithTimeout('sebitam-students');
                    const listTeachers = await dbGetWithTimeout('sebitam-teachers');
                    const listAdmins = await dbGetWithTimeout('sebitam-admins');
                    const listSecs = await dbGetWithTimeout('sebitam-secretaries');
                    const countSt = students.length;

                    const professoresIbma = safeLocalGet();
                    const alunosIbma = safeLocalGet();
                    html = `
                    <div class="welcome-card"><h1 style="color: white !important;">Olá, ${currentUser.name}!
                        ${currentUser.loginType === 'escolas-ibma' && currentUser.role === 'admin' ? `
                        <span style="display:inline-flex;align-items:center;gap:6px;font-size:0.7rem;background:rgba(234,179,8,0.25);border:1px solid rgba(234,179,8,0.5);border-radius:20px;padding:3px 12px;margin-left:10px;vertical-align:middle;font-weight:700;letter-spacing:0.5px;color:#fef08a;">
                            ⭐ Super Admin
                        </span>` : ''}
                    </h1></div>
                    ${currentUser.loginType === 'escolas-ibma' ? `

                    ${currentUser.role === 'admin' ? `
                    <!-- PAINEL ADMIN IBMA -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin:24px 0;">
                        <div class="stat-card" style="text-align:center;padding:20px 12px;">
                            <div class="stat-icon" style="margin:0 auto 10px;"><i data-lucide="graduation-cap"></i></div>
                            <div class="stat-value">${professoresIbma.length}</div>
                            <div class="stat-label">Professores</div>
                        </div>
                        <div class="stat-card" style="text-align:center;padding:20px 12px;">
                            <div class="stat-icon" style="margin:0 auto 10px;"><i data-lucide="users"></i></div>
                            <div class="stat-value">${alunosIbma.length}</div>
                            <div class="stat-label">Alunos</div>
                        </div>
                        <div class="stat-card" style="text-align:center;padding:20px 12px;">
                            <div class="stat-icon" style="margin:0 auto 10px;"><i data-lucide="book-open"></i></div>
                            <div class="stat-value">${new Set(alunosIbma.map(a => a.escola || a.modulo).filter(Boolean)).size || 5}</div>
                            <div class="stat-label">Escolas Ativas</div>
                        </div>
                        <div class="stat-card" style="text-align:center;padding:20px 12px;">
                            <div class="stat-icon" style="margin:0 auto 10px;"><i data-lucide="message-circle"></i></div>
                            <div class="stat-value" style="font-size:1.2rem;">Chat</div>
                            <div class="stat-label">Tempo Real</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
                        <button class="btn-primary ibma-nav-btn" data-view="alunos-ibma" style="padding:10px 20px;font-size:0.9rem;display:flex;align-items:center;gap:8px;">
                            <i data-lucide="users" style="width:16px;height:16px;"></i> Ver Alunos e Notas
                        </button>
                        <button class="btn-primary ibma-nav-btn" data-view="theology-ai" style="padding:10px 20px;font-size:0.9rem;background:var(--secondary);display:flex;align-items:center;gap:8px;">
                            <i data-lucide="message-circle" style="width:16px;height:16px;"></i> Abrir Chat IBMA
                        </button>
                    </div>
                    ` : ''}

                    <div class="view-header" style="margin-top: 8px; display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
                        <div style="width: 52px; height: 52px; border-radius: 14px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="graduation-cap" style="width: 28px; height: 28px;"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.5rem; font-weight: 800; color: var(--text-main);">Cadastro de Professores</h2>
                            <p style="margin: 4px 0 0; font-size: 0.9rem; color: var(--text-muted);">Cadastre professores com Nome, Telefone e E-mail</p>
                        </div>
                    </div>
                    <div class="form-container" style="max-width: 600px; padding: 24px; margin-bottom: 24px; background: white; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border);">
                        <form id="cadastro-professores-ibma-form">
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="font-weight: 700; font-size: 0.9rem;">Nome completo</label>
                                <div class="input-field" style="position: relative;">
                                    <i data-lucide="user" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; color: var(--text-muted);"></i>
                                    <input type="text" name="fullName" placeholder="Nome completo" required style="width: 100%; padding: 12px 16px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border);">
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="font-weight: 700; font-size: 0.9rem;">Telefone</label>
                                <div class="input-field" style="position: relative;">
                                    <i data-lucide="phone" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; color: var(--text-muted);"></i>
                                    <input type="tel" name="phone" placeholder="(00) 00000-0000" required style="width: 100%; padding: 12px 16px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border);">
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 20px;">
                                <label style="font-weight: 700; font-size: 0.9rem;">E-mail</label>
                                <div class="input-field" style="position: relative;">
                                    <i data-lucide="mail" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; color: var(--text-muted);"></i>
                                    <input type="email" name="email" placeholder="email@exemplo.com" required style="width: 100%; padding: 12px 16px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border);">
                                </div>
                            </div>
                            <button type="submit" class="btn-primary" style="width: auto; padding: 12px 24px;">Adicionar</button>
                        </form>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <i data-lucide="graduation-cap" style="color:var(--primary);width:20px;height:20px;"></i>
                        <h3 style="margin:0;font-size:1rem;font-weight:700;color:var(--text-main);">Professores Cadastrados</h3>
                    </div>
                    <div class="staff-contacts-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 40px;">
                        ${professoresIbma.length === 0 ? '<p style="color: var(--text-muted); grid-column: 1/-1;">Nenhum professor cadastrado.</p>' : professoresIbma.map(p => `
                        <div class="stat-card" style="height: auto; padding: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 600; font-size: 1rem; color: var(--text-main); margin-bottom: 8px;">${p.fullName || p.nome || '-'}</div>
                                <div style="font-size: 0.9rem; color: var(--primary); display: flex; align-items: center; gap: 6px; margin-bottom: 4px;"><i data-lucide="phone" style="width: 14px; height: 14px;"></i> ${p.phone || '-'}</div>
                                <div style="font-size: 0.9rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;"><i data-lucide="mail" style="width: 14px; height: 14px;"></i> ${p.email || '-'}</div>
                            </div>
                            <button class="btn-icon red delete-professor-ibma" data-id="${p.id}" title="Excluir" style="padding: 6px;"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
                        </div>
                        `).join('')}
                    </div>

                    <div class="view-header" style="margin-top: 40px; display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
                        <div style="width: 52px; height: 52px; border-radius: 14px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="users" style="width: 28px; height: 28px;"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.5rem; font-weight: 800; color: var(--text-main);">Cadastro de Alunos</h2>
                            <p style="margin: 4px 0 0; font-size: 0.9rem; color: var(--text-muted);">Nome completo, Telefone, E-mail e Escola</p>
                        </div>
                    </div>
                    <div class="form-container" style="max-width: 600px; padding: 24px; margin-bottom: 24px; background: white; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border);">
                        <form id="cadastro-alunos-ibma-form">
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="font-weight: 700; font-size: 0.9rem;">Nome completo</label>
                                <div class="input-field" style="position: relative;">
                                    <i data-lucide="user" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; color: var(--text-muted);"></i>
                                    <input type="text" name="fullName" placeholder="Nome completo" required style="width: 100%; padding: 12px 16px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border);">
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="font-weight: 700; font-size: 0.9rem;">Telefone</label>
                                <div class="input-field" style="position: relative;">
                                    <i data-lucide="phone" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; color: var(--text-muted);"></i>
                                    <input type="tel" name="phone" placeholder="(00) 00000-0000" required style="width: 100%; padding: 12px 16px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border);">
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="font-weight: 700; font-size: 0.9rem;">E-mail</label>
                                <div class="input-field" style="position: relative;">
                                    <i data-lucide="mail" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; color: var(--text-muted);"></i>
                                    <input type="email" name="email" placeholder="email@exemplo.com" required style="width: 100%; padding: 12px 16px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border);">
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 20px;">
                                <label style="font-weight: 700; font-size: 0.9rem;">Escola</label>
                                <div class="modulo-selector" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                                    <label class="modulo-option" style="cursor: pointer; padding: 12px; border: 2px solid var(--border); border-radius: 10px; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                                        <input type="radio" name="escola" value="membresia" required style="display: none;">
                                        <span>Membresia</span>
                                    </label>
                                    <label class="modulo-option" style="cursor: pointer; padding: 12px; border: 2px solid var(--border); border-radius: 10px; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                                        <input type="radio" name="escola" value="discipulado" style="display: none;">
                                        <span>Discipulado</span>
                                    </label>
                                    <label class="modulo-option" style="cursor: pointer; padding: 12px; border: 2px solid var(--border); border-radius: 10px; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                                        <input type="radio" name="escola" value="batismo" style="display: none;">
                                        <span>Batismo</span>
                                    </label>
                                    <label class="modulo-option" style="cursor: pointer; padding: 12px; border: 2px solid var(--border); border-radius: 10px; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                                        <input type="radio" name="escola" value="oracao" style="display: none;">
                                        <span>Oração</span>
                                    </label>
                                    <label class="modulo-option" style="cursor: pointer; padding: 12px; border: 2px solid var(--border); border-radius: 10px; display: flex; align-items: center; gap: 10px; transition: all 0.2s;">
                                        <input type="radio" name="escola" value="maturidade" style="display: none;">
                                        <span>Maturidade Cristã</span>
                                    </label>
                                </div>
                            </div>
                            <button type="submit" class="btn-primary" style="width: auto; padding: 12px 24px;">Adicionar</button>
                        </form>
                    </div>
                    <div class="staff-contacts-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 40px;">
                        ${alunosIbma.length === 0 ? '<p style="color: var(--text-muted); grid-column: 1/-1;">Nenhum aluno cadastrado.</p>' : alunosIbma.map(a => `
                        <div class="stat-card" style="height: auto; padding: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 600; font-size: 1rem; color: var(--text-main); margin-bottom: 8px;">${a.fullName || a.nome || '-'}</div>
                                <div style="font-size: 0.85rem; color: var(--primary); margin-bottom: 4px;">Escola: ${({ membresia: 'Membresia', discipulado: 'Discipulado', batismo: 'Batismo', oracao: 'Oração', maturidade: 'Maturidade Cristã' }[a.escola || a.modulo] || '-')}</div>
                                <div style="font-size: 0.9rem; color: var(--primary); display: flex; align-items: center; gap: 6px; margin-bottom: 4px;"><i data-lucide="phone" style="width: 14px; height: 14px;"></i> ${a.phone || '-'}</div>
                                <div style="font-size: 0.9rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;"><i data-lucide="mail" style="width: 14px; height: 14px;"></i> ${a.email || '-'}</div>
                            </div>
                            <button class="btn-icon red delete-aluno-ibma" data-id="${a.id}" title="Excluir" style="padding: 6px;"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
                        </div>
                        `).join('')}
                    </div>

                    ` : ''}
                    ${currentUser.loginType !== 'escolas-ibma' ? `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon"><i data-lucide="users"></i></div>
                            <div class="stat-value">${countSt}</div>
                            <div class="stat-label">Alunos Matriculados</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i data-lucide="graduation-cap"></i></div>
                            <div class="stat-value">${listTeachers.length}</div>
                            <div class="stat-label">Professores</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i data-lucide="layers"></i></div>
                            <div class="stat-value">5</div>
                            <div class="stat-label">Módulos Ativos</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i data-lucide="trending-up"></i></div>
                            <div class="stat-value">98%</div>
                            <div class="stat-label">Média de Frequência</div>
                        </div>
                    </div>

                    ` : ''}
                    ${currentUser.loginType !== 'escolas-ibma' ? `
                    <div class="view-header" style="margin-top: 32px; margin-bottom: 20px;">
                        <h2>Acesso Rápido</h2>
                    </div>
                    <div class="overview-shortcuts-grid">
                        <a href="#" class="overview-shortcut" data-view="users">
                            <div class="overview-shortcut-icon"><i data-lucide="users"></i></div>
                            <span class="overview-shortcut-label">Gestão de Usuários</span>
                        </a>
                        <a href="#" class="overview-shortcut" data-view="didatico">
                            <div class="overview-shortcut-icon"><i data-lucide="book-open"></i></div>
                            <span class="overview-shortcut-label">Didático</span>
                        </a>
                        <a href="#" class="overview-shortcut" data-view="enrollment">
                            <div class="overview-shortcut-icon"><i data-lucide="user-plus"></i></div>
                            <span class="overview-shortcut-label">Cadastro Geral</span>
                        </a>
                        <a href="#" class="overview-shortcut" data-view="classes">
                            <div class="overview-shortcut-icon"><i data-lucide="clipboard-list"></i></div>
                            <span class="overview-shortcut-label">Alunos</span>
                        </a>
                        <a href="https://drive.google.com/drive/folders/1bHiOrFojPoQOcaTerk23vi-y8jtKwTd5" target="_blank" rel="noopener noreferrer" class="overview-shortcut overview-shortcut-external">
                            <div class="overview-shortcut-icon"><i data-lucide="image"></i></div>
                            <span class="overview-shortcut-label">Fotos & Vídeos</span>
                        </a>
                        <a href="#" class="overview-shortcut" data-view="termo">
                            <div class="overview-shortcut-icon"><i data-lucide="file-text"></i></div>
                            <span class="overview-shortcut-label">Normas Sebitam</span>
                        </a>
                        <a href="#" class="overview-shortcut" data-view="mensalidades">
                            <div class="overview-shortcut-icon"><i data-lucide="wallet"></i></div>
                            <span class="overview-shortcut-label">Mensalidades</span>
                        </a>
                        <a href="#" class="overview-shortcut" data-view="matricula-escolas">
                            <div class="overview-shortcut-icon"><i data-lucide="school"></i></div>
                            <span class="overview-shortcut-label">Matrícula Escolas</span>
                        </a>
                        <a href="#" class="overview-shortcut" data-view="institucional">
                            <div class="overview-shortcut-icon"><i data-lucide="building"></i></div>
                            <span class="overview-shortcut-label">Institucional</span>
                        </a>
                    </div>
                    ` : ''}
                    ${currentUser.loginType === 'escolas-ibma' ? `
                    <div class="corpo-docente-header" style="margin-top: 40px; display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
                        <div class="corpo-docente-icon" style="width: 52px; height: 52px; border-radius: 14px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i data-lucide="graduation-cap" style="width: 28px; height: 28px;"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.5rem; font-weight: 800; color: var(--text-main);">Professores Escola IBMA</h2>
                            <p style="margin: 4px 0 0; font-size: 0.9rem; color: var(--text-muted);">Professores cadastrados neste módulo</p>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 40px;">
                        <div class="stat-card" style="height: auto; align-items: flex-start; padding: 25px; background: white; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border); width: 100%;">
                            <div style="width: 100%;">
                                ${professoresIbma.length === 0 ? '<p style="font-size: 0.9rem; color: var(--text-muted);">Nenhum professor cadastrado.</p>' :
                                professoresIbma.map(t => `
                                        <div style="margin-bottom: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
                                            <div>
                                                <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${t.fullName || t.name}</div>
                                                <div style="color: var(--primary); font-size: 0.85rem; display: flex; align-items: center; gap: 5px; margin-top: 4px;">
                                                    <i data-lucide="phone" style="width: 14px; height: 14px;"></i> <strong>${t.phone || 'Sem contato'}</strong>
                                                </div>
                                                <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;">${t.email || ''}</div>
                                            </div>
                                            ${currentUser.role === 'admin' ? `
                                            <button class="btn-icon red delete-staff-ibma-ov" data-id="${t.id}" title="Excluir" style="padding: 4px; width: 28px; height: 28px;">
                                                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                                            </button>` : ''}
                                        </div>
                                    `).join('')
                            }   </div>
                        </div>
                    </div>
                    ` : ''}
                    ${currentUser.loginType !== 'escolas-ibma' ? `
                    <div class="corpo-docente-header" style="margin-top: 40px; display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
                        <div class="corpo-docente-icon" style="width: 52px; height: 52px; border-radius: 14px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i data-lucide="graduation-cap" style="width: 28px; height: 28px;"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.5rem; font-weight: 800; color: var(--text-main);">Corpo Docente Sebitam</h2>
                            <p style="margin: 4px 0 0; font-size: 0.9rem; color: var(--text-muted);">Administradores, Secretaria e Professores</p>
                        </div>
                    </div>

                    <div class="staff-contacts-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 40px;">
                        <!-- ADM Card -->
                        <div class="stat-card" style="height: auto; align-items: flex-start; padding: 25px; background: white; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border);">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; width: 100%; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                                <i data-lucide="shield" style="color: var(--primary);"></i>
                                <h3 style="font-size: 1.1rem; font-weight: 700;">Administradores</h3>
                            </div>
                            <div style="width: 100%;">
                                ${listAdmins.length === 0 ? '<p style="font-size: 0.9rem; color: var(--text-muted);">Nenhum administrador cadastrado.</p>' :
                                listAdmins.map(a => `
                                        <div style="margin-bottom: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
                                            <div>
                                                <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${a.name}</div>
                                                <div style="color: var(--primary); font-size: 0.85rem; display: flex; align-items: center; gap: 5px; margin-top: 4px;">
                                                    <i data-lucide="phone" style="width: 14px; height: 14px;"></i> <strong>${a.phone || 'Sem contato'}</strong>
                                                </div>
                                            </div>
                                            ${currentUser.role !== 'student' ? `
                                            <button class="btn-icon red delete-staff-ov" data-id="${a.id}" data-type="admin" title="Excluir" style="padding: 4px; width: 28px; height: 28px;">
                                                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                                            </button>` : ''}
                                        </div>
                                    `).join('')
                            }                   </div>
                        </div>

                        <!-- Sec Card -->
                        <div class="stat-card" style="height: auto; align-items: flex-start; padding: 25px; background: white; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border);">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; width: 100%; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                                <i data-lucide="briefcase" style="color: var(--primary);"></i>
                                <h3 style="font-size: 1.1rem; font-weight: 700;">Secretaria</h3>
                            </div>
                            <div style="width: 100%;">
                                 ${listSecs.length === 0 ? '<p style="font-size: 0.9rem; color: var(--text-muted);">Nenhum secretário cadastrado.</p>' :
                                listSecs.map(s => `
                                        <div style="margin-bottom: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
                                            <div>
                                                <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${s.name}</div>
                                                <div style="color: var(--primary); font-size: 0.85rem; display: flex; align-items: center; gap: 5px; margin-top: 4px;">
                                                    <i data-lucide="phone" style="width: 14px; height: 14px;"></i> <strong>${s.phone || 'Sem contato'}</strong>
                                                </div>
                                            </div>
                                            ${currentUser.role !== 'student' ? `
                                            <button class="btn-icon red delete-staff-ov" data-id="${s.id}" data-type="secretary" title="Excluir" style="padding: 4px; width: 28px; height: 28px;">
                                                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                                            </button>` : ''}
                                        </div>
                                    `).join('')
                            }                   </div>
                        </div>

                        <!-- Teacher Card -->
                        <div class="stat-card" style="height: auto; align-items: flex-start; padding: 25px; background: white; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border);">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; width: 100%; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                                <i data-lucide="graduation-cap" style="color: var(--primary);"></i>
                                <h3 style="font-size: 1.1rem; font-weight: 700;">Professores</h3>
                            </div>
                            <div style="width: 100%;">
                                ${listTeachers.length === 0 ? '<p style="font-size: 0.9rem; color: var(--text-muted);">Nenhum professor cadastrado.</p>' :
                                listTeachers.map(t => `
                                        <div style="margin-bottom: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
                                            <div>
                                                <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${t.name}</div>
                                                <div style="color: var(--primary); font-size: 0.85rem; display: flex; align-items: center; gap: 5px; margin-top: 4px;">
                                                    <i data-lucide="phone" style="width: 14px; height: 14px;"></i> <strong>${t.phone || 'Sem contato'}</strong>
                                                </div>
                                            </div>
                                            ${currentUser.role !== 'student' ? `
                                            <button class="btn-icon red delete-staff-ov" data-id="${t.id}" data-type="teacher" title="Excluir" style="padding: 4px; width: 28px; height: 28px;">
                                                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                                            </button>` : ''}
                                        </div>
                                    `).join('')
                            }
                            </div>
                        </div>
                    </div>
                    ` : ''
                        }
        `;
                    setTimeout(() => {
                        // Botões de atalho do painel Admin IBMA
                        document.querySelectorAll('.ibma-nav-btn').forEach(btn => {
                            btn.addEventListener('click', () => renderView(btn.dataset.view));
                        });
                        document.querySelectorAll('.delete-staff-ov').forEach(b => {
                            b.onclick = async () => {
                                const type = b.dataset.type;
                                const id = b.dataset.id;
                                console.log(`Deleting staff member: ${type} with id ${id} `);
                                const label = type === 'admin' ? 'Administrador' : type === 'teacher' ? 'Professor' : 'Secretário';
                                if (!confirm(`Tem certeza que deseja excluir este ${label}?`)) return;
                                const key = type === 'teacher' ? 'sebitam-teachers' : type === 'admin' ? 'sebitam-admins' : 'sebitam-secretaries';
                                await dbDeleteItem(key, id);
                                await renderView('overview');
                            };
                        });
                        document.querySelectorAll('.overview-shortcut[data-view]').forEach(el => {
                            el.onclick = async (e) => {
                                e.preventDefault();
                                const view = el.getAttribute('data-view');
                                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                                const navEl = document.querySelector('.nav-item[data-view="' + view + '"]');
                                if (navEl) navEl.classList.add('active');
                                const sidebar = document.getElementById('sidebar');
                                const overlay = document.getElementById('sidebar-overlay');
                                if (window.innerWidth <= 768 && sidebar && overlay) {
                                    sidebar.classList.remove('active');
                                    overlay.classList.remove('active');
                                }
                                await renderView(view);
                            };
                        });
                        const formProfIbma = document.getElementById('cadastro-professores-ibma-form');
                        if (formProfIbma) {
                            formProfIbma.onsubmit = async (e) => {
                                e.preventDefault();
                                const fd = new FormData(formProfIbma);
                                const nome = fd.get('fullName')?.trim();
                                const tel = fd.get('phone')?.trim();
                                const email = fd.get('email')?.trim();
                                if (!nome) { alert('Informe o nome do professor.'); return; }
                                const obj = { fullName: nome, phone: tel, email: email, id: Date.now() };
                                const list = safeLocalGet();
                                list.push(obj);
                                localStorage.setItem('professores-escolas-ibma', JSON.stringify(list));
                                formProfIbma.reset();
                                await renderView('overview');
                            };

                        }
                        const formAlunosIbma = document.getElementById('cadastro-alunos-ibma-form');
                        if (formAlunosIbma) {
                            formAlunosIbma.onsubmit = async (e) => {
                                e.preventDefault();
                                const fd = new FormData(formAlunosIbma);
                                const obj = { fullName: fd.get('fullName'), phone: fd.get('phone'), email: fd.get('email'), escola: fd.get('escola'), id: Date.now() };
                                const list = safeLocalGet();
                                list.push(obj);
                                localStorage.setItem('alunos-escolas-ibma', JSON.stringify(list));
                                await renderView('overview');
                            };
                        }
                        document.querySelectorAll('.delete-professor-ibma').forEach(btn => {
                            btn.onclick = async () => {
                                if (!confirm('Excluir este professor?')) return;
                                const list = safeLocalGet().filter(x => String(x.id) !== String(btn.dataset.id));
                                localStorage.setItem('professores-escolas-ibma', JSON.stringify(list));
                                await renderView('overview');
                            };
                        });
                        document.querySelectorAll('.delete-aluno-ibma').forEach(btn => {
                            btn.onclick = async () => {
                                if (!confirm('Excluir este aluno?')) return;
                                const list = safeLocalGet().filter(x => String(x.id) !== String(btn.dataset.id));
                                localStorage.setItem('alunos-escolas-ibma', JSON.stringify(list));
                                await renderView('overview');
                            };
                        });
                        lucide.createIcons();
                    }, 0);
                    break;
                case 'alunos-ibma': {
                    let alunosIbmaList = safeLocalGet();
                    const escolaLabels = { membresia: 'Membresia', discipulado: 'Discipulado', batismo: 'Batismo', oracao: 'Oração', maturidade: 'Maturidade Cristã' };

                    const printBoletim = (aluno) => {
                        const escolaNome = escolaLabels[aluno.escola || aluno.modulo] || '-';
                        const w = window.open('', '_blank');
                        const bolRows = (aluno.boletimDados || [{ disciplina: escolaNome, frequencia: '—', nota: '—', situacao: 'Em andamento' }])
                            .map(d => `< tr ><td>${d.disciplina || '-'}</td><td>${d.frequencia || '—'}</td><td>${d.nota || '—'}</td><td>${d.situacao || '—'}</td></tr > `).join('');
                        w.document.write(`< html ><head><title>Boletim - ${aluno.fullName}</title>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1e293b; }
                        .header { display: flex; align-items: center; gap: 20px; border-bottom: 2px solid #1a365d; padding-bottom: 16px; margin-bottom: 20px; }
                        .header img { width: 70px; height: 70px; object-fit: contain; }
                        .header-text h1 { margin: 0; color: #1a365d; font-size: 1.4rem; }
                        .header-text p { margin: 4px 0 0; color: #64748b; font-size: 0.9rem; }
                        .info { margin: 20px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                        .info p { margin: 4px 0; } .info strong { color: #1a365d; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
                        th { background: #1a365d; color: white; }
                        tr:nth-child(even) { background: #f8fafc; }
                        .no-print { margin-top: 30px; }
                        @media print { .no-print { display: none; } }
                    </style></head><body>
                    <div class="header">
                        <img src="/logo-escolas-ibma.png" alt="Logo Escola IBMA">
                        <div class="header-text">
                            <h1>Boletim do Aluno</h1>
                            <p>Escola IBMA — Seminário Bíblico Teológico da Amazônia</p>
                        </div>
                    </div>
                    <div class="info">
                        <p><strong>Nome:</strong> ${aluno.fullName || aluno.nome || '-'}</p>
                        <p><strong>Escola:</strong> ${escolaNome}</p>
                        <p><strong>Telefone:</strong> ${aluno.phone || '-'}</p>
                        <p><strong>E-mail:</strong> ${aluno.email || '-'}</p>
                    </div>
                    <table>
                        <thead><tr><th>Disciplina</th><th>Frequência</th><th>Nota</th><th>Situação</th></tr></thead>
                        <tbody>${bolRows}</tbody>
                    </table>
                    <div class="no-print"><button onclick="window.print()" style="padding:10px 24px;background:#1a365d;color:white;border:none;border-radius:6px;cursor:pointer;font-size:1rem;">Imprimir</button></div>
                    </body></html > `);
                        w.document.close();
                    };

                    const printCertificado = (aluno) => {
                        const escolaNome = escolaLabels[aluno.escola || aluno.modulo] || '-';
                        const certInfo = aluno.certDados || {};
                        const dataHoje = certInfo.dataEmissao || new Date().toLocaleDateString('pt-BR');
                        const obsExtra = certInfo.observacao ? `< p style = "font-style:italic;color:#475569;margin-top:12px;" > ${certInfo.observacao}</p > ` : '';
                        const w = window.open('', '_blank');
                        w.document.write(`< html ><head><title>Certificado - ${aluno.fullName}</title>
                    <style>
                        body { font-family: 'Georgia', serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f0f4f8; }
                        .cert { border: 10px double #1a365d; padding: 60px 80px; text-align: center; max-width: 720px; background: white; box-shadow: 0 8px 40px rgba(0,0,0,0.12); }
                        .cert img { width: 90px; height: 90px; object-fit: contain; margin-bottom: 16px; }
                        .cert h1 { font-size: 1.8rem; color: #1a365d; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 6px; }
                        .cert .subtitle { font-size: 0.9rem; color: #64748b; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 30px; }
                        .cert h2 { font-size: 1.9rem; color: #0f172a; margin: 16px 0; font-style: italic; }
                        .cert p { font-size: 1.05rem; color: #334155; line-height: 1.9; }
                        .cert .escola { font-size: 1.4rem; font-weight: bold; color: #1a365d; margin: 8px 0 16px; }
                        .cert .data { margin-top: 40px; font-size: 0.9rem; color: #64748b; }
                        .cert .line { width: 220px; border-top: 1px solid #1a365d; margin: 10px auto 4px; }
                        .cert .assinatura { font-size: 0.85rem; color: #1a365d; }
                        @media print { body { background: white; } .no-print { display: none; } }
                    </style></head><body>
                    <div class="cert">
                        <img src="/logo-escolas-ibma.png" alt="Logo Escola IBMA">
                        <h1>Certificado de Conclusão</h1>
                        <div class="subtitle">Escola IBMA — SEBITAM</div>
                        <p>Certificamos que</p>
                        <h2>${aluno.fullName || aluno.nome || '-'}</h2>
                        <p>concluiu com êxito o curso de</p>
                        <div class="escola">${escolaNome}</div>
                        <p>oferecido pela <strong>Escola IBMA</strong> —<br>Seminário Bíblico Teológico da Amazônia.</p>
                        ${obsExtra}
                        <div class="data">Emitido em ${dataHoje}</div>
                        <br>
                        <div class="line"></div>
                        <div class="assinatura">Direção — SEBITAM</div>
                        <br>
                        <div class="no-print" style="margin-top:20px;"><button onclick="window.print()" style="padding:10px 24px;background:#1a365d;color:white;border:none;border-radius:6px;cursor:pointer;font-size:1rem;">Imprimir</button></div>
                    </div>
                    </body></html>`);
                        w.document.close();
                    };

                    html = `
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 28px;">
                        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="users" style="width: 30px; height: 30px;"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.6rem; font-weight: 800; color: var(--text-main);">Alunos</h2>
                            <p style="margin: 4px 0 0; font-size: 0.95rem; color: var(--text-muted);">Todos os alunos matriculados nas Escolas IBMA</p>
                        </div>
                    </div>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Aluno</th>
                                    <th>Contato</th>
                                    <th>Escola</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${alunosIbmaList.length === 0 ? `
                                    <tr><td colspan="4" style="text-align:center; padding: 32px; color: var(--text-muted);">Nenhum aluno cadastrado ainda.</td></tr>
                                ` : alunosIbmaList.slice().reverse().map(a => `
                                    <tr data-aluno-id="${a.id}">
                                        <td>
                                            <div style="display:flex; align-items:center; gap:10px;">
                                                <div style="width:36px;height:36px;border-radius:50%;background:rgba(var(--primary-rgb),0.1);color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                                    <i data-lucide="user" style="width:17px;height:17px;"></i>
                                                </div>
                                                <span style="font-weight:600;color:var(--text-main);">${a.fullName || a.nome || '-'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div style="display:flex;flex-direction:column;gap:3px;font-size:0.88rem;">
                                                <span style="color:var(--primary);display:flex;align-items:center;gap:5px;"><i data-lucide="mail" style="width:13px;height:13px;"></i> ${a.email || '-'}</span>
                                                <span style="color:var(--text-muted);display:flex;align-items:center;gap:5px;"><i data-lucide="phone" style="width:13px;height:13px;"></i> ${a.phone || '-'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span style="background:rgba(var(--primary-rgb),0.1);color:var(--primary);padding:4px 12px;border-radius:20px;font-size:0.82rem;font-weight:600;">
                                                ${escolaLabels[a.escola || a.modulo] || '-'}
                                            </span>
                                        </td>
                                        <td>
                                             <div style="display:flex;align-items:center;gap:6px;">
                                                 <button class="btn-icon ibma-boletim-btn" data-id="${a.id}" title="Boletim" style="color:#3b82f6;">
                                                     <i data-lucide="file-text" style="width:17px;height:17px;"></i>
                                                 </button>
                                                 <button class="btn-icon ibma-certificado-btn" data-id="${a.id}" title="Certificado" style="color:#8b5cf6;">
                                                     <i data-lucide="award" style="width:17px;height:17px;"></i>
                                                 </button>
                                                 <button class="btn-icon ibma-print-btn" data-id="${a.id}" title="Imprimir" style="color:#059669;">
                                                     <i data-lucide="printer" style="width:17px;height:17px;"></i>
                                                 </button>
                                                 ${(currentUser.role === 'teacher' || currentUser.role === 'admin') ? `
                                                 <button class="btn-icon ibma-edit-btn" data-id="${a.id}" title="Editar" style="color:#f59e0b;">
                                                     <i data-lucide="edit-3" style="width:17px;height:17px;"></i>
                                                 </button>
                                                 <button class="btn-icon red ibma-delete-btn" data-id="${a.id}" title="Excluir">
                                                     <i data-lucide="trash-2" style="width:17px;height:17px;"></i>
                                                 </button>
                                                 ` : ''}
                                             </div>

                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                    setTimeout(() => {
                        lucide.createIcons();

                        document.querySelectorAll('.ibma-boletim-btn').forEach(btn => {
                            btn.onclick = () => {
                                const aluno = alunosIbmaList.find(a => String(a.id) === String(btn.dataset.id));
                                if (aluno) printBoletim(aluno);
                            };
                        });

                        document.querySelectorAll('.ibma-certificado-btn').forEach(btn => {
                            btn.onclick = () => {
                                const aluno = alunosIbmaList.find(a => String(a.id) === String(btn.dataset.id));
                                if (aluno) printCertificado(aluno);
                            };
                        });

                        document.querySelectorAll('.ibma-print-btn').forEach(btn => {
                            btn.onclick = () => {
                                const aluno = alunosIbmaList.find(a => String(a.id) === String(btn.dataset.id));
                                if (aluno) printBoletim(aluno);
                            };
                        });

                        document.querySelectorAll('.ibma-edit-btn').forEach(btn => {
                            btn.onclick = () => {
                                const aluno = alunosIbmaList.find(a => String(a.id) === String(btn.dataset.id));
                                if (!aluno) return;

                                // Remove existing modal if any
                                document.getElementById('ibma-edit-modal')?.remove();

                                const bols = aluno.boletimDados || [{ disciplina: escolaLabels[aluno.escola || aluno.modulo] || '-', frequencia: '', nota: '', situacao: 'Em andamento' }];
                                const cert = aluno.certDados || { dataEmissao: new Date().toLocaleDateString('pt-BR'), observacao: '' };

                                const modal = document.createElement('div');
                                modal.id = 'ibma-edit-modal';
                                modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
                                modal.innerHTML = `
                                <div style="background:#ffffff;border-radius:20px;padding:32px;max-width:620px;width:100%;max-height:90vh;overflow-y:auto;color:#1e293b;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                                    <button id="ibma-modal-close" style="position:absolute;top:16px;right:16px;background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:1.4rem;">✕</button>
                                    <h2 style="margin:0 0 6px;font-size:1.3rem;font-weight:800;color:#0f172a;">Editar Aluno</h2>
                                    <p style="margin:0 0 24px;font-size:0.9rem;color:#64748b;">Dados do boletim e certificado para <strong style="color:#1e293b;">${aluno.fullName || aluno.nome || ''}</strong></p>

                                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
                                        <div>
                                            <label style="font-size:0.8rem;font-weight:600;color:#64748b;display:block;margin-bottom:4px;">Nome Completo</label>
                                            <input id="ibma-edit-nome" value="${aluno.fullName || aluno.nome || ''}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:0.95rem;box-sizing:border-box;">
                                        </div>
                                        <div>
                                            <label style="font-size:0.8rem;font-weight:600;color:#64748b;display:block;margin-bottom:4px;">Telefone</label>
                                            <input id="ibma-edit-tel" value="${aluno.phone || ''}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:0.95rem;box-sizing:border-box;">
                                        </div>
                                        <div>
                                            <label style="font-size:0.8rem;font-weight:600;color:#64748b;display:block;margin-bottom:4px;">E-mail</label>
                                            <input id="ibma-edit-email" value="${aluno.email || ''}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:0.95rem;box-sizing:border-box;">
                                        </div>
                                        <div>
                                            <label style="font-size:0.8rem;font-weight:600;color:#64748b;display:block;margin-bottom:4px;">Data de Emissão (Certificado)</label>
                                            <input id="ibma-edit-data" value="${cert.dataEmissao}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:0.95rem;box-sizing:border-box;">
                                        </div>
                                    </div>

                                    <div style="margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
                                        <label style="font-size:0.85rem;font-weight:700;color:#6366f1;">📄 Boletim — Disciplinas</label>
                                        <button id="ibma-add-disc" style="background:#ede9fe;color:#6366f1;border:none;padding:5px 12px;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:600;">+ Adicionar</button>
                                    </div>
                                    <div id="ibma-disc-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
                                        ${bols.map((d, i) => `
                                            <div class="ibma-disc-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 1.5fr auto;gap:8px;align-items:center;">
                                                <input class="disc-nome" value="${d.disciplina || ''}" placeholder="Disciplina" style="padding:9px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:0.88rem;">
                                                <input class="disc-freq" value="${d.frequencia || ''}" placeholder="Freq. %" style="padding:9px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:0.88rem;text-align:center;">
                                                <input class="disc-nota" value="${d.nota || ''}" placeholder="Nota" style="padding:9px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:0.88rem;text-align:center;">
                                                <select class="disc-sit" style="padding:9px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:0.88rem;">
                                                    <option ${d.situacao === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
                                                    <option ${d.situacao === 'Aprovado' ? 'selected' : ''}>Aprovado</option>
                                                    <option ${d.situacao === 'Reprovado' ? 'selected' : ''}>Reprovado</option>
                                                    <option ${d.situacao === 'Concluído' ? 'selected' : ''}>Concluído</option>
                                                </select>
                                                <button class="ibma-rm-disc" style="background:#fee2e2;color:#ef4444;border:none;padding:9px;border-radius:8px;cursor:pointer;">✕</button>
                                            </div>
                                        `).join('')}
                                    </div>

                                    <label style="font-size:0.85rem;font-weight:700;color:#6366f1;display:block;margin-bottom:6px;">🏅 Observação no Certificado</label>
                                    <textarea id="ibma-edit-obs" placeholder="Texto adicional que aparecerá no certificado (opcional)..." style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:0.9rem;resize:vertical;min-height:70px;box-sizing:border-box;">${cert.observacao || ''}</textarea>

                                    <div style="display:flex;gap:12px;margin-top:24px;justify-content:flex-end;">
                                        <button id="ibma-modal-cancel" style="padding:11px 24px;border-radius:10px;border:1px solid #e2e8f0;background:#f1f5f9;color:#64748b;cursor:pointer;font-size:0.95rem;">Cancelar</button>
                                        <button id="ibma-modal-save" style="padding:11px 28px;border-radius:10px;border:none;background:#6366f1;color:white;font-weight:700;cursor:pointer;font-size:0.95rem;">Salvar</button>
                                    </div>
                                </div>
                            `;
                                document.body.appendChild(modal);
                                lucide.createIcons();

                                const closeModal = () => modal.remove();
                                modal.querySelector('#ibma-modal-close').onclick = closeModal;
                                modal.querySelector('#ibma-modal-cancel').onclick = closeModal;
                                modal.onclick = (e) => { if (e.target === modal) closeModal(); };

                                // Add discipline row
                                modal.querySelector('#ibma-add-disc').onclick = () => {
                                    const list = modal.querySelector('#ibma-disc-list');
                                    const row = document.createElement('div');
                                    row.className = 'ibma-disc-row';
                                    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1.5fr auto;gap:8px;align-items:center;';
                                    row.innerHTML = `
                                    <input class="disc-nome" placeholder="Disciplina" style="padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.07);color:var(--text-main,#f1f5f9);font-size:0.88rem;">
                                    <input class="disc-freq" placeholder="Freq. %" style="padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.07);color:var(--text-main,#f1f5f9);font-size:0.88rem;text-align:center;">
                                    <input class="disc-nota" placeholder="Nota" style="padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.07);color:var(--text-main,#f1f5f9);font-size:0.88rem;text-align:center;">
                                    <select class="disc-sit" style="padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--card-bg,#1e293b);color:var(--text-main,#f1f5f9);font-size:0.88rem;">
                                        <option>Em andamento</option><option>Aprovado</option><option>Reprovado</option><option>Concluído</option>
                                    </select>
                                    <button class="ibma-rm-disc" style="background:rgba(239,68,68,0.12);color:#ef4444;border:none;padding:9px;border-radius:8px;cursor:pointer;">✕</button>
                                `;
                                    list.appendChild(row);
                                    row.querySelector('.ibma-rm-disc').onclick = () => row.remove();
                                };

                                // Remove discipline rows
                                modal.querySelectorAll('.ibma-rm-disc').forEach(b => b.onclick = () => b.closest('.ibma-disc-row').remove());

                                // Save
                                modal.querySelector('#ibma-modal-save').onclick = () => {
                                    const rows = modal.querySelectorAll('.ibma-disc-row');
                                    const boletimDados = Array.from(rows).map(r => ({
                                        disciplina: r.querySelector('.disc-nome').value,
                                        frequencia: r.querySelector('.disc-freq').value,
                                        nota: r.querySelector('.disc-nota').value,
                                        situacao: r.querySelector('.disc-sit').value,
                                    }));
                                    const list = safeLocalGet();
                                    const idx = list.findIndex(a => String(a.id) === String(aluno.id));
                                    if (idx !== -1) {
                                        list[idx].fullName = modal.querySelector('#ibma-edit-nome').value;
                                        list[idx].phone = modal.querySelector('#ibma-edit-tel').value;
                                        list[idx].email = modal.querySelector('#ibma-edit-email').value;
                                        list[idx].boletimDados = boletimDados;
                                        list[idx].certDados = {
                                            dataEmissao: modal.querySelector('#ibma-edit-data').value,
                                            observacao: modal.querySelector('#ibma-edit-obs').value,
                                        };
                                        localStorage.setItem('alunos-escolas-ibma', JSON.stringify(list));
                                    }
                                    closeModal();
                                    renderView('alunos-ibma');
                                };
                            };
                        });


                        document.querySelectorAll('.ibma-delete-btn').forEach(btn => {
                            btn.onclick = () => {
                                if (!confirm('Excluir este aluno?')) return;
                                const list = safeLocalGet().filter(a => String(a.id) !== String(btn.dataset.id));
                                localStorage.setItem('alunos-escolas-ibma', JSON.stringify(list));
                                renderView('alunos-ibma');
                            };
                        });
                    }, 0);
                    break;
                }
                case 'professores-ibma': {
                    const profList = safeLocalGet();

                    html = `
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 28px;">
                        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="graduation-cap" style="width: 30px; height: 30px;"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.6rem; font-weight: 800; color: var(--text-main);">Professores</h2>
                            <p style="margin: 4px 0 0; font-size: 0.95rem; color: var(--text-muted);">Todos os professores cadastrados nas Escolas IBMA</p>
                        </div>
                    </div>
                    ${profList.length === 0 ? `
                        <div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
                            <i data-lucide="graduation-cap" style="width:48px;height:48px;margin-bottom:16px;opacity:0.3;"></i>
                            <p style="font-size:1rem;">Nenhum professor cadastrado ainda.</p>
                        </div>
                    ` : `
                        <div class="table-container">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Professor</th>
                                        <th>Contato</th>
                                        ${(currentUser.role === 'teacher' || currentUser.role === 'admin') ? '<th>Ações</th>' : ''}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${profList.map(p => `
                                        <tr>
                                            <td>
                                                <div style="display:flex;align-items:center;gap:12px;">
                                                    <div style="width:38px;height:38px;border-radius:50%;background:rgba(var(--primary-rgb),0.1);color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                                        <i data-lucide="user" style="width:18px;height:18px;"></i>
                                                    </div>
                                                    <div>
                                                        <div style="font-weight:700;color:var(--text-main);">${p.name || p.fullName || '-'}</div>
                                                        <div style="font-size:0.8rem;color:var(--text-muted);">Professor</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div style="font-size:0.88rem;color:var(--text-muted);display:flex;flex-direction:column;gap:4px;">
                                                    ${p.email ? `<span style="display:flex;align-items:center;gap:5px;"><i data-lucide="mail" style="width:13px;height:13px;"></i>${p.email}</span>` : ''}
                                                    ${p.phone ? `<span style="display:flex;align-items:center;gap:5px;"><i data-lucide="phone" style="width:13px;height:13px;"></i>${p.phone}</span>` : ''}
                                                    ${!p.email && !p.phone ? '<span>—</span>' : ''}
                                                </div>
                                            </td>
                                            ${(currentUser.role === 'teacher' || currentUser.role === 'admin') ? `
                                            <td>
                                                <div style="display:flex;align-items:center;gap:6px;">
                                                    <button class="btn-icon red ibma-del-prof-btn" data-id="${p.id}" title="Excluir">
                                                        <i data-lucide="trash-2" style="width:17px;height:17px;"></i>
                                                    </button>
                                                </div>
                                            </td>
                                            ` : ''}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                `;
                    setTimeout(() => {
                        lucide.createIcons();
                        document.querySelectorAll('.ibma-del-prof-btn').forEach(btn => {
                            btn.onclick = () => {
                                if (!confirm('Excluir este professor?')) return;
                                const list = safeLocalGet()
                                    .filter(p => String(p.id) !== String(btn.dataset.id));
                                localStorage.setItem('professores-escolas-ibma', JSON.stringify(list));
                                renderView('professores-ibma');
                            };
                        });
                    }, 0);
                    break;
                }
                case 'modulos-ibma': {

                    const modulosIbma = [
                        { id: 'membresia', nome: 'Membresia', icon: 'user-check', url: 'https://drive.google.com/drive/folders/1YaUTtYRvjIOGILbRJZxlT-nVIA7OWRxe' },
                        { id: 'discipulado', nome: 'Discipulado', icon: 'users', url: null },
                        { id: 'batismo', nome: 'Batismo', icon: 'droplet', url: null },
                        { id: 'oracao', nome: 'Oração', icon: 'heart-handshake', url: null },
                        { id: 'maturidade', nome: 'Maturidade Cristã', icon: 'star', url: null }
                    ];
                    html = `
                    <div class="view-header" style="display: flex; align-items: center; gap: 16px; margin-bottom: 32px;">
                        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="layers" style="width: 30px; height: 30px;"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.6rem; font-weight: 800; color: var(--text-main);">Módulos Escola IBMA</h2>
                            <p style="margin: 6px 0 0; font-size: 0.95rem; color: var(--text-muted);">Baixe o material de cada módulo</p>
                        </div>
                    </div>
                    <div class="modules-download-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px;">
                        ${modulosIbma.map(m => `
                        <div class="stat-card" style="height: auto; padding: 28px; display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center;">
                            <div style="width: 64px; height: 64px; border-radius: 18px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="${m.icon}" style="width: 32px; height: 32px;"></i>
                            </div>
                            <h3 style="margin: 0; font-size: 1.2rem; font-weight: 700; color: var(--text-main);">${m.nome}</h3>
                            ${m.url ? `<a href="${m.url}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="width: 100%; padding: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; font-size: 0.95rem;"><i data-lucide="download"></i> Baixar Material</a>` : `<span class="btn-primary" style="width: 100%; padding: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.95rem; opacity: 0.7; cursor: default;"><i data-lucide="download"></i> Baixar Material</span>`}
                        </div>
                        `).join('')}
                    </div>
                `;
                    setTimeout(() => lucide.createIcons(), 0);
                    break;
                }
                case 'modulos-sebitam': {
                    // Módulos do SEBITAM - visível para professores, admins e secretários
                    const modulosSebitam = [
                        { id: 1, title: 'Módulo 1: Fundamentos', icon: 'book-open', subs: ['Bibliologia', 'Teontologia', 'Introdução N.T', 'Introdução A.T'] },
                        { id: 2, title: 'Módulo 2: Contexto Histórico', icon: 'map', subs: ['Geografia Bíblica', 'Hermenêutica', 'Período Inter bíblico', 'Ética Cristã'] },
                        { id: 3, title: 'Módulo 3: Doutrinas Específica', icon: 'layers', subs: ['Soteriologia', 'Eclesiologia', 'Escatologia', 'Homlética'] },
                        { id: 4, title: 'Módulo 4: Teologia Aplicada', icon: 'briefcase', subs: ['Teologia Contemporânea', 'In. T. Bíblica A.T', 'In. T. Bíblica N.T', 'Teologia Pastoral'] },
                        { id: 5, title: 'Módulo 5: Prática Pastoral', icon: 'heart', subs: ['Exegese Bíblica', 'Psicologia Pastoral'] },
                    ];
                    html = `
                    <div class="view-header" style="display: flex; align-items: center; gap: 16px; margin-bottom: 32px;">
                        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="layers" style="width: 30px; height: 30px;"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.6rem; font-weight: 800; color: var(--text-main);">Módulos SEBITAM</h2>
                            <p style="margin: 6px 0 0; font-size: 0.95rem; color: var(--text-muted);">Grade curricular do Curso Médio em Teologia</p>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
                        ${modulosSebitam.map(m => `
                        <div class="stat-card" style="height: auto; padding: 28px; align-items: flex-start;">
                            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border); width: 100%;">
                                <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i data-lucide="${m.icon}" style="width: 24px; height: 24px;"></i>
                                </div>
                                <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main);">${m.title}</h3>
                            </div>
                            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; width: 100%;">
                                ${m.subs.map(sub => `
                                <li style="display: flex; align-items: center; gap: 10px; color: var(--text-muted); font-size: 0.95rem;">
                                    <i data-lucide="check-circle" style="width: 16px; height: 16px; color: var(--primary); flex-shrink: 0;"></i>
                                    ${sub}
                                </li>`).join('')}
                            </ul>
                            ${(currentUser.role === 'teacher' || currentUser.role === 'admin' || currentUser.role === 'secretary') ? `
                            <button onclick="renderView('classes')" class="btn-primary" style="margin-top: 20px; width: 100%; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.9rem;">
                                <i data-lucide="users"></i> Ver Alunos deste Módulo
                            </button>` : ''}
                        </div>
                        `).join('')}
                    </div>
                `;
                    setTimeout(() => lucide.createIcons(), 0);
                    break;
                }
                case 'matricula-escolas': {
                    const matriculas = safeLocalGet();
                    const escolas = [
                        { id: 'membresia', nome: 'Membresia', icon: 'user-check' },
                        { id: 'discipulos', nome: 'Discípulos', icon: 'users' },
                        { id: 'batismo', nome: 'Batismo', icon: 'droplet' },
                        { id: 'maturidade', nome: 'Maturidade Cristã', icon: 'star' }
                    ];
                    html = `
                    <div class="matricula-escolas-header" style="display: flex; align-items: center; gap: 16px; margin-bottom: 32px;">
                        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="school" style="width: 30px; height: 30px;"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 1.6rem; font-weight: 800; color: var(--text-main);">Matrícula para Escolas</h2>
                            <p style="margin: 6px 0 0; font-size: 0.95rem; color: var(--text-muted);">Inscreva-se em uma das escolas da IBMA</p>
                        </div>
                    </div>
                    <div class="form-container" style="max-width: 700px; padding: 35px; background: white; border-radius: 24px; box-shadow: var(--shadow); border: 1px solid var(--border); margin-bottom: 40px;">
                        <form id="matricula-escolas-form">
                            <div class="form-group" style="margin-bottom: 20px;">
                                <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">Nome completo</label>
                                <div class="input-field" style="position: relative;">
                                    <i data-lucide="user" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; color: var(--text-muted);"></i>
                                    <input type="text" name="fullName" placeholder="Seu nome completo" required style="width: 100%; padding: 14px 14px 14px 48px; border-radius: 12px; border: 1.5px solid var(--border); background: white;">
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 20px;">
                                <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">Telefone</label>
                                <div class="input-field" style="position: relative;">
                                    <i data-lucide="phone" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; color: var(--text-muted);"></i>
                                    <input type="tel" name="phone" placeholder="(00) 00000-0000" required style="width: 100%; padding: 14px 14px 14px 48px; border-radius: 12px; border: 1.5px solid var(--border); background: white;">
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 24px;">
                                <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">E-mail</label>
                                <div class="input-field" style="position: relative;">
                                    <i data-lucide="mail" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 18px; color: var(--text-muted);"></i>
                                    <input type="email" name="email" placeholder="seu@email.com" required style="width: 100%; padding: 14px 14px 14px 48px; border-radius: 12px; border: 1.5px solid var(--border); background: white;">
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 28px;">
                                <label style="font-weight: 700; color: var(--text-main); margin-bottom: 12px; display: block; font-size: 0.9rem;">Escola</label>
                                <div class="escolas-selector" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                                    ${escolas.map(e => `
                                        <label class="escola-option" style="cursor: pointer; text-align: center;">
                                            <input type="radio" name="escola" value="${e.id}" required style="display: none;">
                                            <div class="escola-card" style="padding: 20px; border: 2px solid var(--border); border-radius: 16px; background: white; transition: all 0.25s; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                                                <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(var(--primary-rgb), 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                                                    <i data-lucide="${e.icon}" style="width: 22px; height: 22px;"></i>
                                                </div>
                                                <span style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${e.nome}</span>
                                            </div>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                            <button type="submit" class="btn-primary" style="width: 100%; padding: 16px; font-size: 1rem;">Enviar Matrícula</button>
                        </form>
                    </div>
                    <div class="view-header" style="margin-top: 24px;">
                        <h3 style="font-size: 1.2rem;">Matrículas recentes</h3>
                    </div>
                    <div class="table-container" style="max-width: 900px;">
                        <table class="data-table">
                            <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Escola</th><th>Ações</th></tr></thead>
                            <tbody>
                                ${matriculas.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">Nenhuma matrícula cadastrada.</td></tr>' :
                            matriculas.slice().reverse().slice(0, 50).map(m => `
                                    <tr data-matricula-id="${m.id}">
                                        <td>${m.fullName || m.nome || '-'}</td>
                                        <td>${m.phone || '-'}</td>
                                        <td>${m.email || '-'}</td>
                                        <td>${(escolas.find(e => e.id === m.escola) || {}).nome || m.escola || '-'}</td>
                                        <td>
                                            <div class="matricula-actions" style="display: flex; gap: 8px; align-items: center;">
                                                <button class="btn-icon matricula-btn-boletim" data-id="${m.id}" title="Visualizar boletim"><i data-lucide="file-text"></i></button>
                                                <button class="btn-icon matricula-btn-historico" data-id="${m.id}" title="Histórico"><i data-lucide="history"></i></button>
                                                <button class="btn-icon matricula-btn-editar" data-id="${m.id}" title="Editar"><i data-lucide="edit-3"></i></button>
                                                <button class="btn-icon red matricula-btn-excluir" data-id="${m.id}" title="Excluir"><i data-lucide="trash-2"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                    setTimeout(() => {
                        document.querySelectorAll('.escola-option input').forEach((radio, i) => {
                            const card = radio.closest('label').querySelector('.escola-card');
                            radio.addEventListener('change', () => {
                                document.querySelectorAll('.escola-card').forEach(c => {
                                    c.style.borderColor = 'var(--border)';
                                    c.style.background = 'white';
                                });
                                if (card) { card.style.borderColor = 'var(--primary)'; card.style.background = 'rgba(var(--primary-rgb), 0.05)'; }
                            });
                        });
                        document.getElementById('matricula-escolas-form').onsubmit = async (e) => {
                            e.preventDefault();
                            const fd = new FormData(e.target);
                            const obj = { fullName: fd.get('fullName'), phone: fd.get('phone'), email: fd.get('email'), escola: fd.get('escola'), id: Date.now() };
                            const list = safeLocalGet();
                            list.push(obj);
                            localStorage.setItem('matriculas-escolas', JSON.stringify(list));
                            alert('Matrícula enviada com sucesso!');
                            await renderView('matricula-escolas');
                        };
                        lucide.createIcons();
                    }, 0);
                    break;
                }
                case 'enrollment':
                    const activeType = data && data.type ? data.type : 'student';
                    html = `
                    <div class="view-header" style="margin-bottom: 30px;">
                        <h2 style="font-size: 2.22rem; font-weight: 800; color: var(--text-main);">Cadastro Institucional</h2>
                        <span style="background: var(--primary); color: white; padding: 5px 12px; border-radius: 4px; font-size: 0.9rem; font-weight: 500; display: inline-block; margin-top: 5px;">Selecione o perfil que deseja cadastrar no sistema.</span>
                    </div>
                    
                    <div class="registration-role-selector" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 35px;">
                        ${['student', 'teacher', 'admin', 'secretary'].map(type => {
                        const icons = { student: 'user', teacher: 'graduation-cap', admin: 'shield-check', secretary: 'briefcase' };
                        const labels = { student: 'Aluno', teacher: 'Professor', admin: 'Administrador', secretary: 'Secretária' };
                        const isActive = activeType === type;
                        return `
                                <label class="role-option" style="text-align: center; cursor: pointer;">
                                    <input type="radio" name="reg-role" value="${type}" ${isActive ? 'checked' : ''} style="margin-bottom: 12px; transform: scale(1.3); accent-color: var(--primary);">
                                    <div class="role-box" style="padding: 25px 10px; border: 1.5px solid ${isActive ? 'var(--primary)' : 'var(--border)'}; border-radius: 15px; background: white; transition: all 0.3s; box-shadow: ${isActive ? '0 4px 15px rgba(0,0,0,0.05)' : 'none'}; position: relative;">
                                        <i data-lucide="${icons[type]}" style="width: 24px; height: 24px; color: ${isActive ? 'var(--primary)' : 'var(--text-muted)'}; margin-bottom: 8px;"></i>
                                        <span style="display: block; font-weight: 600; font-size: 0.85rem; color: ${isActive ? 'var(--text-main)' : 'var(--text-muted)'};">${labels[type]}</span>
                                    </div>
                                </label>
                            `;
                    }).join('')}
                    </div>

                    <div id="reg-form-container"></div>
                `;
                    setTimeout(() => {
                        const renderForm = (type) => {
                            const container = document.getElementById('reg-form-container');
                            const roleNames = { student: 'Aluno', teacher: 'Professor(a)', admin: 'Administrador(a)', secretary: 'Secretário(a)' };
                            const nameLabel = `Nome Completo do(a) ${roleNames[type]}`;

                            let formHtml = `
                            <div class="form-container" style="max-width: 900px; padding: 45px; background: white; border-radius: 25px; box-shadow: 0 10px 40px rgba(0,0,0,0.04); border: 1px solid var(--border); margin-top: 20px;">
                                <form id="unified-reg-form">
                                    <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                                        <div class="form-group full-width" style="grid-column: 1 / -1; margin-bottom: 20px;">
                                            <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">${nameLabel}</label>
                                            <div class="input-field" style="position: relative;">
                                                <i data-lucide="user" style="position: absolute; left: 16px; top: 12px; width: 18px; color: var(--text-main);"></i>
                                                <input type="text" name="${type === 'student' ? 'fullName' : 'name'}" placeholder="Nome completo" style="width: 100%; padding: 12px 12px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border); background: white;" required>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">Telefone / WhatsApp</label>
                                            <div class="input-field" style="position: relative;">
                                                <i data-lucide="phone" style="position: absolute; left: 16px; top: 12px; width: 18px; color: var(--text-main);"></i>
                                                <input type="tel" name="phone" placeholder="(00) 00000-0000" style="width: 100%; padding: 12px 12px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border); background: white;" required>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">E-mail</label>
                                            <div class="input-field" style="position: relative;">
                                                <i data-lucide="mail" style="position: absolute; left: 16px; top: 12px; width: 18px; color: var(--text-main);"></i>
                                                <input type="email" name="email" placeholder="email@exemplo.com" style="width: 100%; padding: 12px 12px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border); background: white;" required>
                                            </div>
                                        </div>
                        `;

                            if (type === 'student') {
                                formHtml += `
                                        <div class="form-group">
                                            <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">Turma (1 a 10)</label>
                                            <div class="input-field" style="position: relative;">
                                                <i data-lucide="hash" style="position: absolute; left: 16px; top: 12px; width: 18px; color: var(--text-main);"></i>
                                                <select name="grade" style="width: 100%; padding: 12px 12px 12px 45px; border-radius: 10px; border: 1.5px solid var(--border); background: white;">
                                                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}">Turma ${n}</option>`).join('')}
                                                </select>
                                            </div>
                                        </div>
                                         <div class="form-group">
                                            <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">Módulo (1 a 5)</label>
                                            <div class="input-field" style="position: relative;">
                                                <i data-lucide="layers" style="position: absolute; left: 16px; top: 12px; width: 18px; color: var(--text-main);"></i>
                                                <select name="module" style="width: 100%; padding: 12px 12px 12px 45px; border-radius: 10px; border: 1.5px solid var(--border); background: white;">
                                                    <option value="1">Módulo 1</option><option value="2">Módulo 2</option><option value="3">Módulo 3</option><option value="4">Módulo 4</option><option value="5">Módulo 5</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">Plano Financeiro</label>
                                            <div class="input-field" style="position: relative;">
                                                <i data-lucide="credit-card" style="position: absolute; left: 16px; top: 12px; width: 18px; color: var(--text-main);"></i>
                                                <select name="plan" style="width: 100%; padding: 12px 12px 12px 45px; border-radius: 10px; border: 1.5px solid var(--border); background: white;">
                                                    <option value="integral">Integral (R$ 70,00)</option>
                                                    <option value="half">Parcial (R$ 35,00)</option>
                                                    <option value="scholarship">Bolsista</option>
                                                </select>
                                            </div>
                                        </div>
                            `;
                            } else {
                                const extraIcon = type === 'teacher' ? 'graduation-cap' : (type === 'admin' ? 'shield-check' : 'briefcase');
                                formHtml += `
                                        <div class="form-group full-width" style="grid-column: 1 / -1; margin-top: 10px;">
                                            <label style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; display: block; font-size: 0.9rem;">Função / Cargo</label>
                                            <div class="input-field" style="position: relative;">
                                                <i data-lucide="${extraIcon}" style="position: absolute; left: 16px; top: 12px; width: 18px; color: var(--text-main);"></i>
                                                <input type="text" name="extra" placeholder="Ex: Financeiro" style="width: 100%; padding: 12px 12px 12px 48px; border-radius: 10px; border: 1.5px solid var(--border); background: white;" required>
                                            </div>
                                        </div>
                            `;
                            }

                            formHtml += `
                                    </div>
                                    <div class="form-actions" style="border:none; margin-top: 40px;">
                                        <button type="submit" class="btn-primary" style="width: auto; padding: 15px 40px; border-radius: 10px; font-weight: 700; font-size: 1rem; color: white; border: none; cursor: pointer;">Salvar Cadastro</button>
                                    </div>
                                </form>
                            </div>
                        `;
                            container.innerHTML = formHtml;
                            lucide.createIcons();
                            const form = container.querySelector('form');
                            form.onsubmit = async (e) => {
                                e.preventDefault();
                                const fd = new FormData(form);
                                const val = Object.fromEntries(fd.entries());
                                val.id = Date.now();
                                const key = type === 'student' ? 'sebitam-students' : type === 'teacher' ? 'sebitam-teachers' : type === 'admin' ? 'sebitam-admins' : 'sebitam-secretaries';
                                await dbAddItem(key, val);

                                const userEmail = (val.email || currentUser.email || 'unknown').toLowerCase();
                                const userKey = `sebitam-user-${userEmail}`;
                                localStorage.setItem(userKey, 'registered');

                                alert('Cadastrado com sucesso! Você será direcionado para a Visão Geral.');
                                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                                const overviewNav = document.querySelector('.nav-item[data-view="overview"]');
                                if (overviewNav) overviewNav.classList.add('active');
                                await renderView('overview');
                            };
                        };

                        renderForm(activeType);
                        document.querySelectorAll('input[name="reg-role"]').forEach(radio => {
                            radio.addEventListener('change', (e) => {
                                renderForm(e.target.value);
                                // Visual transition handled by CSS variables indirectly or manual refresh
                                const currentThemePrimary = getComputedStyle(document.body).getPropertyValue('--primary').trim();
                                const currentThemeTextMain = getComputedStyle(document.body).getPropertyValue('--text-main').trim();

                                document.querySelectorAll('.role-box').forEach(box => {
                                    box.style.borderColor = 'var(--border)';
                                    box.style.boxShadow = 'none';
                                    box.querySelector('i').style.color = 'var(--text-muted)';
                                    box.querySelector('span').style.color = 'var(--text-muted)';
                                });
                                const selectedBox = e.target.parentElement.querySelector('.role-box');
                                selectedBox.style.borderColor = 'var(--primary)';
                                selectedBox.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
                                selectedBox.querySelector('i').style.color = 'var(--primary)';
                                selectedBox.querySelector('span').style.color = 'var(--text-main)';
                            });
                        });
                    }, 0);
                    break;
                case 'users':
                    const activeUserTab = data && data.type ? data.type : 'student';
                    const getStoreKey = (type) => {
                        switch (type) {
                            case 'student': return 'sebitam-students';
                            case 'teacher': return 'sebitam-teachers';
                            case 'admin': return 'sebitam-admins';
                            case 'secretary': return 'sebitam-secretaries';
                            default: return 'sebitam-students';
                        }
                    };

                    const usersList = await dbGet(getStoreKey(activeUserTab));
                    const labelMap = { student: 'Aluno', teacher: 'Professor', admin: 'Adm', secretary: 'Secretaria' };

                    html = `
                        <div class="view-header" > <h2>Gestão de Usuários</h2></div>
                    <div class="tabs-container" style="display:flex; flex-wrap: wrap; gap:10px; margin-bottom:20px;">
                        <button class="tab-btn ${activeUserTab === 'admin' ? 'active' : ''}" data-type="admin">Administradores</button>
                        <button class="tab-btn ${activeUserTab === 'secretary' ? 'active' : ''}" data-type="secretary">Secretaria</button>
                        <button class="tab-btn ${activeUserTab === 'teacher' ? 'active' : ''}" data-type="teacher">Professores</button>
                        <button class="tab-btn ${activeUserTab === 'student' ? 'active' : ''}" data-type="student">Alunos</button>
                    </div>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>${activeUserTab === 'student' ? 'Turma' : 'Cargo'}</th>
                                    <th>E-mail</th>
                                    <th>Telefone</th>
                                    <th class="text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${usersList.map(u => {
                        const uName = u.fullName || u.name || 'Sem Nome';
                        const nameCap = uName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                        const roleInfo = activeUserTab === 'student' ? `Turma&nbsp;${u.grade || '-'}` : (labelMap[activeUserTab]);
                        const email = u.email || u.institutionalEmail || '-';
                        const phone = u.phone || '-';

                        let badgeStyle = 'background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border);';
                        if (activeUserTab === 'student') {
                            if (u.plan === 'scholarship') {
                                badgeStyle = 'background: rgba(168, 85, 247, 0.1); color: #a855f7; border: 1px solid #a855f7;';
                            } else if (u.plan === 'half') {
                                badgeStyle = 'background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid #3b82f6;';
                            } else if (u.plan === 'integral') {
                                badgeStyle = 'background: rgba(34, 197, 94, 0.1); color: #16a34a; border: 1px solid #16a34a;';
                            }
                        }

                        return `
                                        <tr>
                                            <td><strong>${nameCap}</strong></td>
                                            <td><span class="badge" style="${badgeStyle}">${roleInfo}</span></td>
                                            <td style="font-size: 0.85rem;">${email}</td>
                                            <td style="font-size: 0.85rem; white-space: nowrap;">${phone}</td>
                                            <td class="actions-cell">
                                                <div class="actions-wrapper">
                                                    ${currentUser.role !== 'student' ? `
                                                        <button class="btn-icon" style="color: #64748b;" title="Editar/Configurar" onclick="${activeUserTab === 'student' ? `renderEditStudent('${u.id}')` : `alert('Função em desenvolvimento para este perfil')`}">
                                                            <i data-lucide="settings"></i>
                                                        </button>
                                                        <button class="btn-icon red delete-user" data-id="${u.id}" data-type="${activeUserTab}" title="Excluir">
                                                            <i data-lucide="trash-2"></i>
                                                        </button>
                                                    ` : ''}
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                    }).join('')}
                                ${usersList.length === 0 ? `<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum registro encontrado.</td></tr>` : ''}
                            </tbody>
                        </table>
                    </div>`;
                    setTimeout(() => {
                        document.querySelectorAll('.tab-btn').forEach(b => {
                            b.onclick = () => renderView('users', { type: b.dataset.type });
                        });

                        document.querySelectorAll('.delete-user').forEach(b => {
                            b.onclick = async () => {
                                const utype = b.dataset.type;
                                const uid = b.dataset.id;
                                console.log(`Deleting user: ${utype} with id ${uid} `);
                                if (!confirm(`Tem certeza que deseja excluir este ${labelMap[utype]}?`)) return;
                                const ukey = getStoreKey(utype);
                                await dbDeleteItem(ukey, uid);
                                await renderView('users', { type: utype });
                            };
                        });


                        lucide.createIcons();
                    }, 0);
                    break;
                case 'classes':
                    let allSt = await dbGet('sebitam-students');
                    if (currentUser.role === 'student') {
                        allSt = allSt.filter(s => s.fullName.toLowerCase().trim() === currentUser.name.toLowerCase().trim());
                    }
                    // Professores vêem todos os alunos
                    html = `
                        <div class="view-header" > <h2>${currentUser.role === 'student' ? 'Minha Situação Acadêmica' : 'Gestão de Alunos'}</h2></div>
                        <div style="background: rgba(234, 179, 8, 0.1); border: 1px solid #eab308; color: #854d0e; padding: 15px 20px; border-radius: 12px; margin-bottom: 25px; display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 0.95rem; box-shadow: var(--shadow-sm);">
                            <i data-lucide="info" style="width: 20px; height: 20px;"></i>
                            <span>AVISO: DIA DE PAGAMENTO DA MENSALIDADE DO SEBTAM DIAS 05 A 10 DE CADA MÊS</span>
                        </div>`;

                    if (currentUser.role === 'student' && allSt.length > 0) {
                        const me = allSt[0];
                        const status = me.paymentStatus || (['integral', 'scholarship'].includes(me.plan) ? 'Pago' : 'Pendente');
                        html += `
                        <div class="welcome-card" style="margin-bottom: 30px; padding: 30px; background: linear-gradient(135deg, var(--primary), #1e40af); box-shadow: var(--shadow-lg); border-radius: 20px;">
                             <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                                 <h3 style="color: white; margin: 0; font-size: 1.4rem;">Situação Cadastral Individual</h3>
                                 <span class="badge" style="background: ${status === 'Pago' ? '#22c55e' : '#ef4444'}; color: white; border: none; font-weight: 800; padding: 8px 16px; border-radius: 50px; font-size: 0.8rem; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">${status.toUpperCase()}</span>
                             </div>
                             <div class="profile-card-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 25px;">
                                 <div class="info-item">
                                     <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Nome Completo</label>
                                     <div style="color: white; font-weight: 700; font-size: 1.15rem;">${me.fullName}</div>
                                 </div>
                                 <div class="info-item">
                                     <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">E-mail Institucional</label>
                                     <div style="color: white; font-weight: 600; font-size: 1rem;">${me.email || '-'}</div>
                                 </div>
                                 <div class="info-item">
                                     <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">WhatsApp / Telefone</label>
                                     <div style="color: white; font-weight: 600; font-size: 1rem;">${me.phone || '-'}</div>
                                 </div>
                                 <div class="info-item">
                                     <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Turma Designada</label>
                                     <div style="color: white; font-weight: 700; font-size: 1.15rem; display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="users" style="width: 18px; height: 18px;"></i> Turma ${me.grade || '-'}
                                     </div>
                                 </div>
                                 <div class="info-item">
                                     <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Módulo Atual</label>
                                     <div style="color: white; font-weight: 700; font-size: 1.15rem; display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="layers" style="width: 18px; height: 18px;"></i> Módulo ${me.module || '-'}
                                     </div>
                                 </div>
                                 <div class="info-item">
                                     <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Modalidade de Plano</label>
                                     <div style="color: white; font-weight: 700; text-transform: capitalize; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="credit-card" style="width: 18px; height: 18px;"></i> ${me.plan || '-'}
                                     </div>
                                 </div>
                             </div>
                        </div>
                    `;
                    }

                    html += `
                            <div class="turmas-container">
                                ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g => {
                        const inG = allSt.filter(s => s.grade == g);
                        if (inG.length === 0) return '';
                        return `
                                <div class="turma-section" style="background: white; padding: 25px; border-radius: 15px; margin-bottom: 25px; box-shadow: var(--shadow); border: 1px solid var(--border);">
                                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid var(--bg-main); padding-bottom: 12px;">
                                        <i data-lucide="users" style="color: var(--primary); width: 20px; height: 20px;"></i>
                                        <h3 style="margin: 0; color: var(--text-main); font-weight: 700;">Turma ${g}</h3>
                                    </div>
                                    <div class="table-responsive" style="overflow-x: auto;">
                                        <table class="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Aluno</th>
                                                    <th>Contato</th>
                                                    <th>Plano</th>
                                                    ${currentUser.role !== 'student' ? '<th>Financeiro</th>' : ''}
                                                    <th class="text-right" style="text-align: right;">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${inG.map(s => {
                            const nameCap = (s.fullName || 'Sem Nome').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                            const planLabel = s.plan === 'integral' ? 'Integral' : s.plan === 'half' ? 'Parcial' : 'Bolsista';
                            const status = s.paymentStatus || (['integral', 'scholarship'].includes(s.plan) ? 'Pago' : 'Pendente');

                            let stColor, stIcon, stBg, stLabel;
                            if (s.plan === 'scholarship') {
                                stLabel = 'Bolsista';
                                stColor = '#a855f7'; // Purple
                                stBg = 'rgba(168, 85, 247, 0.1)';
                                stIcon = 'graduation-cap';
                            } else if (status === 'Pago') {
                                stLabel = 'Pago';
                                if (s.plan === 'half') {
                                    stColor = '#3b82f6'; // Blue
                                    stBg = 'rgba(59, 130, 246, 0.1)';
                                } else { // Integral
                                    stColor = '#16a34a'; // Green
                                    stBg = 'rgba(34, 197, 94, 0.1)';
                                }
                                stIcon = 'check-circle';
                            } else {
                                stLabel = 'Pendente';
                                stColor = '#dc2626'; // Red
                                stBg = 'rgba(239, 68, 68, 0.1)';
                                stIcon = 'alert-circle';
                            }

                            return `
                                                    <tr>
                                                        <td>
                                                            <div style="display:flex; align-items:center; gap:8px;">
                                                                 <div style="background: ${stBg}; padding: 6px; border-radius: 50%; display: flex; text-align: center; justify-content: center;">
                                                                    <i data-lucide="${stIcon}" style="width: 16px; height: 16px; color: ${stColor};"></i>
                                                                </div>
                                                                <strong style="font-size: 0.95rem;">${nameCap}</strong>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div style="display: flex; flex-direction: column; font-size: 0.8rem; color: var(--text-muted);">
                                                                <span style="display: flex; align-items: center; gap: 4px;"><i data-lucide="mail" style="width:10px;"></i> ${s.email || '-'}</span>
                                                                <span style="display: flex; align-items: center; gap: 4px;"><i data-lucide="phone" style="width:10px;"></i> ${s.phone || '-'}</span>
                                                            </div>
                                                        </td>
                                                        <td><span class="badge" style="background:transparent; border:1px solid var(--border); color:var(--text-muted); font-size: 0.75rem;">${planLabel}</span></td>
                                                        ${currentUser.role !== 'student' ? `
                                                        <td>
                                                            <div style="display: flex; gap: 5px; align-items: center;">
                                                                <button onclick="updatePaymentStatus('${s.id}', 'Pago')" class="btn-icon" title="Confirmar Pagamento" style="border: 1px solid #22c55e; background: rgba(34, 197, 94, 0.1); width: 30px; height: 30px;">
                                                                    <i data-lucide="check-circle" style="width: 16px; height: 16px; color: #22c55e;"></i>
                                                                </button>
                                                                <button onclick="updatePaymentStatus('${s.id}', 'Pendente')" class="btn-icon" title="Marcar como Pendente" style="border: 1px solid #ef4444; background: rgba(239, 68, 68, 0.1); width: 30px; height: 30px;">
                                                                    <i data-lucide="alert-circle" style="width: 16px; height: 16px; color: #ef4444;"></i>
                                                                </button>
                                                                <span class="badge" style="background: ${stBg}; color: ${stColor}; border: 1px solid ${stColor}; margin-left: 5px; font-size: 0.75rem;">
                                                                    ${stLabel}
                                                                </span>
                                                            </div>
                                                        </td>` : ''}
                                                        <td class="actions-cell">
                                                            <div class="actions-wrapper">
                                                                 <button class="btn-icon" style="color: var(--primary); background: rgba(37, 99, 235, 0.1);" title="${currentUser.role === 'student' ? 'Ver Meu Boletim' : 'Lançar Notas'}" onclick="renderGradeEditor('${s.id}')">
                                                                    <i data-lucide="${currentUser.role === 'student' ? 'eye' : 'edit-3'}"></i>
                                                                </button>
                                                                <button class="btn-icon" style="color: #16a34a; background: rgba(34, 197, 94, 0.1);" title="Visualizar Boletim Completo" onclick="printBoletim('${s.id}')">
                                                                    <i data-lucide="file-text"></i>
                                                                </button>
                                                                <button class="btn-icon" title="Imprimir Certificado" onclick="generateCertificate('${s.id}')">
                                                                    <i data-lucide="printer"></i>
                                                                </button>
                                                                ${currentUser.role !== 'student' ? `
                                                                <button class="btn-icon" style="color: #64748b;" title="Editar Cadastro" onclick="renderEditStudent('${s.id}')">
                                                                    <i data-lucide="settings"></i>
                                                                </button>
                                                                <button class="btn-icon red delete-st-class" data-id="${s.id}" title="Excluir Aluno">
                                                                    <i data-lucide="trash-2"></i>
                                                                </button>` : ''}
                                                            </div>
                                                        </td>
                                                    </tr>`;
                        }).join('')}
                                        </tbody>
                                    </table>
                                </div>`;
                    }).join('')}
                            </div>`;
                    setTimeout(() => {
                        document.querySelectorAll('.delete-st-class').forEach(b => {
                            b.onclick = async () => {
                                const uid = b.dataset.id;
                                console.log(`Deleting student from class view: id ${uid} `);
                                if (!confirm('Tem certeza que deseja excluir permanentemente este aluno?')) return;
                                await dbDeleteItem('sebitam-students', uid);
                                await renderView('classes');
                            };
                        });
                        lucide.createIcons();
                    }, 0);
                    break;
                case 'didatico':
                    const subView = data && data.tab ? data.tab : 'modules';
                    html = `
                    <div class="view-header">
                        <h2>Didático Professores e Alunos</h2>
                        <p>Acesse materiais, módulos e produções acadêmicas.</p>
                    </div>
                    <div class="tabs-container" style="display:flex; gap:10px; margin-bottom:20px; flex-wrap: wrap;">
                        <button class="tab-btn ${subView === 'modules' ? 'active' : ''}" data-tab="modules">Módulos do Curso</button>
                        <button class="tab-btn ${subView === 'prod-teo' ? 'active' : ''}" data-tab="prod-teo">Produção Teológica (PDF)</button>
                        <button class="tab-btn ${subView === 'trabalhos' ? 'active' : ''}" data-tab="trabalhos">Trabalhos Alunos</button>
                        <button class="tab-btn ${subView === 'material-prof' ? 'active' : ''}" data-tab="material-prof"><i data-lucide="book-text" style="width: 16px; height: 16px; margin-right: 6px; vertical-align: -2px;"></i>Material Professores</button>
                    </div>
                `;

                    if (subView === 'modules') {
                        html += `
                        <div class="modules-grid-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                            ${Object.entries(subjectMap).map(([id, data]) => `
                            <div class="module-card" style="background: white; padding: 25px; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border); transition: var(--transition);">
                                <div class="module-header" style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 15px;">
                                    <div class="module-icon" style="width: 45px; height: 45px; border-radius: 12px; background: rgba(37, 99, 235, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                                        <i data-lucide="book-open"></i>
                                    </div>
                                    <h3 style="font-size: 1.1rem; font-weight: 700;">${data.title}</h3>
                                </div>
                                <ul class="subject-list" style="list-style: none; padding: 0; margin-bottom: 25px;">
                                    ${data.subs.map(sub => `
                                        <li style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; color: var(--text-muted); font-size: 0.9rem;">
                                            <i data-lucide="check-circle" style="width: 14px; height: 14px; color: var(--primary);"></i>
                                            ${sub}
                                        </li>
                                    `).join('')}
                                </ul>
                                <a href="https://drive.google.com/drive/folders/1ij80vwRTtx49bW_c28jOYULLP7Yw2Iao" target="_blank" class="btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 10px; text-decoration: none; margin-bottom: 0; font-size: 0.9rem; padding: 12px;">
                                    <i data-lucide="file-text"></i> Abrir Material (PDF)
                                </a>
                            </div>
                        `).join('')}
                        </div>
                    `;
                    } else {
                        const links = {
                            'prod-teo': { url: 'https://drive.google.com/drive/folders/110x1MEaHbcaY7wOpIduiTobnt7Smeggj', title: 'Produção Teológica (PDF)', icon: 'book-marked' },
                            'trabalhos': { url: 'https://drive.google.com/drive/folders/1HXSZPrzEdqbZiVtHmVcRwN3dODs1qASS', title: 'Trabalhos Alunos', icon: 'folder-kanban' },
                            'material-prof': { url: 'https://drive.google.com/drive/folders/1xQbSx_GCR9IqF3k-d7ESNJ8S2C4UcrIF', title: 'Material Professores', icon: 'book-text' }
                        };
                        const activeLink = links[subView];
                        html += `
                        <div class="welcome-card" style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px; padding: 60px;">
                            <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; border: 2px solid white;">
                                <i data-lucide="${activeLink.icon}" style="width: 40px; height: 40px; color: white;"></i>
                            </div>
                            <h3>${activeLink.title}</h3>
                            <p>Clique no botão abaixo para acessar a pasta oficial no Google Drive contendo todo o material de ${activeLink.title}.</p>
                            <a href="${activeLink.url}" target="_blank" class="btn-primary" style="width: auto; padding: 15px 40px; border-radius: 12px; display: flex; align-items: center; gap: 10px; font-weight: 600;">
                                <i data-lucide="external-link"></i> Abrir no Google Drive
                            </a>
                        </div>
                    `;
                    }

                    setTimeout(() => {
                        document.querySelectorAll('.tab-btn').forEach(b => {
                            b.onclick = () => renderView('didatico', { tab: b.dataset.tab });
                        });
                        lucide.createIcons();
                    }, 0);
                    break;

                case 'mensalidades': {
                    const allFinanceSt = await dbGet('sebitam-students');
                    let displayStudents = allFinanceSt;
                    if (currentUser.role === 'student') {
                        displayStudents = allFinanceSt.filter(s => s.fullName.toLowerCase().trim() === currentUser.name.toLowerCase().trim());
                    }

                    const today = new Date();
                    // Logic: Start from February. If today is Jan, show Feb. Else show current month.
                    // 0=Jan, 1=Feb. If month is 0, set to 1. Else keep as is.
                    if (today.getMonth() === 0) {
                        today.setMonth(1);
                    }
                    const currentMonth = today.toLocaleString('pt-BR', { month: 'long' });
                    const currentMonthCapitalized = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);
                    const currentYear = today.getFullYear();

                    html = `
                    <div class="view-header">
                        <h2>${currentUser.role === 'student' ? 'Minha Situação Financeira' : 'Sebitam Mensalidades'}</h2>
                        <p>${currentUser.role === 'student' ? 'Acompanhe sua situação financeira e histórico de pagamentos.' : 'Controle financeiro e monitoramento de mensalidades.'}</p>
                    </div>
                    <div style="background: rgba(234, 179, 8, 0.1); border: 1px solid #eab308; color: #854d0e; padding: 15px 20px; border-radius: 12px; margin-bottom: 25px; display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 0.95rem; box-shadow: var(--shadow-sm);">
                        <i data-lucide="info" style="width: 20px; height: 20px;"></i>
                        <span>AVISO: DIA DE PAGAMENTO DA MENSALIDADE DO SEBTAM DIAS 05 A 10 DE CADA MÊS</span>
                    </div>`;

                    // Card individual para alunos
                    if (currentUser.role === 'student' && displayStudents.length > 0) {
                        const me = displayStudents[0];
                        const status = me.paymentStatus || (['integral', 'scholarship'].includes(me.plan) ? 'Pago' : 'Pendente');
                        const planText = me.plan === 'integral' ? 'Integral' : me.plan === 'half' ? 'Parcial' : 'Bolsista';
                        const valorMensal = me.plan === 'integral' ? 'R$ 70,00' : me.plan === 'half' ? 'R$ 35,00' : 'Isento';

                        html += `
                        <div class="welcome-card" style="margin-bottom: 30px; padding: 35px; background: linear-gradient(135deg, ${status === 'Pago' ? '#10b981' : '#ef4444'}, ${status === 'Pago' ? '#059669' : '#dc2626'}); box-shadow: var(--shadow-lg); border-radius: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                                <h3 style="color: white; margin: 0; font-size: 1.5rem; display: flex; align-items: center; gap: 10px;">
                                    <i data-lucide="wallet" style="width: 28px; height: 28px;"></i>
                                    Situação Financeira - ${currentMonthCapitalized}/${currentYear}
                                </h3>
                                <span class="badge" style="background: white; color: ${status === 'Pago' ? '#10b981' : '#ef4444'}; border: none; font-weight: 800; padding: 10px 20px; border-radius: 50px; font-size: 0.9rem; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
                                    ${status === 'Pago' ? '✓ PAGO' : '⚠ PENDENTE'}
                                </span>
                            </div>
                            
                            <div class="profile-card-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 25px;">
                                <div class="info-item">
                                    <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Modalidade de Plano</label>
                                    <div style="color: white; font-weight: 700; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="credit-card" style="width: 20px; height: 20px;"></i>
                                        ${planText}
                                    </div>
                                </div>
                                <div class="info-item">
                                    <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Valor Mensal</label>
                                    <div style="color: white; font-weight: 800; font-size: 1.4rem;">
                                        ${valorMensal}
                                    </div>
                                </div>
                                <div class="info-item">
                                    <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Período de Referência</label>
                                    <div style="color: white; font-weight: 700; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="calendar" style="width: 20px; height: 20px;"></i>
                                        ${currentMonthCapitalized} ${currentYear}
                                    </div>
                                </div>
                                <div class="info-item">
                                    <label style="color: rgba(255,255,255,0.8); font-size: 0.75rem; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Status do Pagamento</label>
                                    <div style="color: white; font-weight: 800; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="${status === 'Pago' ? 'check-circle' : 'alert-circle'}" style="width: 20px; height: 20px;"></i>
                                        ${status}
                                    </div>
                                </div>
                            </div>
                            
                            ${me.plan !== 'scholarship' ? `
                            <div style="background: rgba(255,255,255,0.15); padding: 20px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.2);">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                                    <i data-lucide="info" style="width: 18px; height: 18px; color: white;"></i>
                                    <strong style="color: white; font-size: 0.95rem;">Informações de Pagamento</strong>
                                </div>
                                <p style="color: rgba(255,255,255,0.95); font-size: 0.9rem; line-height: 1.6; margin: 0;">
                                    ${status === 'Pago'
                                    ? 'Sua mensalidade está em dia! Obrigado por manter seus estudos em ordem.'
                                    : 'Entre em contato com a secretaria para regularizar sua situação financeira. Sua dedicação aos estudos é importante para nós!'}
                                </p>
                            </div>
                            ` : `
                            <div style="background: rgba(255,255,255,0.15); padding: 20px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.2);">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                                    <i data-lucide="graduation-cap" style="width: 18px; height: 18px; color: white;"></i>
                                    <strong style="color: white; font-size: 0.95rem;">Programa de Bolsa de Estudos</strong>
                                </div>
                                <p style="color: rgba(255,255,255,0.95); font-size: 0.9rem; line-height: 1.6; margin: 0;">
                                    Você está contemplado(a) com uma bolsa de estudos integral. Continue dedicado(a) aos seus estudos!
                                </p>
                            </div>
                            `}
                        </div>
                    `;
                    }

                    html += `
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Aluno</th>
                                    ${currentUser.role !== 'student' ? '<th>Contato</th>' : ''}
                                    <th>Mês</th>
                                    <th>Ano</th>
                                    <th>Status</th>
                                    <th>Tipo</th>
                                    ${currentUser.role !== 'student' ? '<th>Valor</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${displayStudents.map(s => {
                        const status = s.paymentStatus || (['integral', 'scholarship'].includes(s.plan) ? 'Pago' : 'Pendente');
                        const planText = s.plan === 'integral' ? 'Integral' : s.plan === 'half' ? 'Parcial' : 'Bolsista';
                        const valorMensal = s.plan === 'integral' ? 'R$ 70,00' : s.plan === 'half' ? 'R$ 35,00' : '-';
                        return `
                                        <tr>
                                            <td><strong style="font-size: 0.95rem;">${s.fullName}</strong></td>
                                            ${currentUser.role !== 'student' ? `
                                            <td>
                                                <div style="display: flex; flex-direction: column; font-size: 0.8rem; color: var(--text-muted);">
                                                    <span style="display: flex; align-items: center; gap: 4px;"><i data-lucide="phone" style="width:10px;"></i> ${s.phone || '-'}</span>
                                                </div>
                                            </td>` : ''}
                                            <td style="text-transform: capitalize; font-size: 0.9rem;">${currentMonth}</td>
                                            <td style="font-size: 0.9rem;">${currentYear}</td>
                                            <td>
                                                <span class="badge" style="background: ${status === 'Pago' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${status === 'Pago' ? '#16a34a' : '#dc2626'}; border: 1px solid ${status === 'Pago' ? '#22c55e' : '#ef4444'}; display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; padding: 4px 10px;">
                                                    <i data-lucide="${status === 'Pago' ? 'check-circle' : 'alert-circle'}" style="width: 12px; height: 12px;"></i>
                                                    ${status}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge" style="background: ${s.plan === 'integral' ? 'rgba(37, 99, 235, 0.1)' : 'transparent'}; border: 1px solid ${s.plan === 'integral' ? '#2563eb' : s.plan === 'scholarship' ? '#9333ea' : '#eab308'}; color: ${s.plan === 'integral' ? '#2563eb' : s.plan === 'scholarship' ? '#9333ea' : '#eab308'}; display: inline-flex; align-items: center; font-size: 0.8rem; padding: 4px 10px;">
                                                    ${s.plan === 'scholarship' ? '<i data-lucide="graduation-cap" style="width:14px; height:14px; margin-right:4px;"></i>' : ''} 
                                                    ${planText}
                                                </span>
                                            </td>
                                            ${currentUser.role !== 'student' ? `<td><strong style="color: var(--primary); font-size: 0.9rem;">${valorMensal}</strong></td>` : ''}
                                        </tr>
                                    `;
                    }).join('')}
                                ${displayStudents.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 30px;">Nenhum registro financeiro encontrado.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top: 20px; padding: 20px; background: rgba(37, 99, 235, 0.05); border-radius: 12px; border: 1px solid var(--border);">
                        <p style="font-size: 0.9rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="info" style="width: 16px;"></i>
                            Nota: Esta tabela reflete o status de pagamento confirmado na aba de gerenciamento de alunos.
                        </p>
                    </div>
                `;
                    setTimeout(() => lucide.createIcons(), 0);
                    break;
                }

                case 'themes':
                    html = `
                    <div class="view-header">
                        <h2>Personalizar Aparência</h2>
                        <p>Escolha o tema visual do sistema que melhor lhe agrada.</p>
                    </div>
                    <div class="form-container" style="text-align: center; max-width: 700px; padding: 40px;">
                        <h3 style="margin-bottom: 30px; color: var(--text-main);">Selecione um Tema</h3>
                        <div class="theme-selector-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 20px;">
                             <button class="theme-option-card" data-theme="professional" style="padding: 20px; border: 2px solid var(--border); border-radius: 15px; background: white; cursor: pointer; transition: 0.3s; display: flex; flex-direction: column; align-items: center;">
                                <div style="width: 50px; height: 50px; border-radius: 50%; background: #2563eb; margin-bottom: 15px; border: 2px solid #e2e8f0;"></div>
                                <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Profissional</span>
                            </button>
                            <button class="theme-option-card" data-theme="man" style="padding: 20px; border: 2px solid var(--border); border-radius: 15px; background: white; cursor: pointer; transition: 0.3s; display: flex; flex-direction: column; align-items: center;">
                                <div style="width: 50px; height: 50px; border-radius: 50%; background: #0f172a; margin-bottom: 15px; border: 2px solid #e2e8f0;"></div>
                                <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Elegante Dark</span>
                            </button>
                            <button class="theme-option-card" data-theme="woman" style="padding: 20px; border: 2px solid var(--border); border-radius: 15px; background: white; cursor: pointer; transition: 0.3s; display: flex; flex-direction: column; align-items: center;">
                                <div style="width: 50px; height: 50px; border-radius: 50%; background: #be185d; margin-bottom: 15px; border: 2px solid #e2e8f0;"></div>
                                <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Sofisticado</span>
                            </button>
                            <button class="theme-option-card" data-theme="elegant" style="padding: 20px; border: 2px solid var(--border); border-radius: 15px; background: white; cursor: pointer; transition: 0.3s; display: flex; flex-direction: column; align-items: center;">
                                <div style="width: 50px; height: 50px; border-radius: 50%; background: #d4af37; margin-bottom: 15px; border: 2px solid #e2e8f0;"></div>
                                <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Luxo Dourado</span>
                            </button>
                            <button class="theme-option-card" data-theme="nature" style="padding: 20px; border: 2px solid var(--border); border-radius: 15px; background: white; cursor: pointer; transition: 0.3s; display: flex; flex-direction: column; align-items: center;">
                                <div style="width: 50px; height: 50px; border-radius: 50%; background: #15803d; margin-bottom: 15px; border: 2px solid #e2e8f0;"></div>
                                <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Natureza</span>
                            </button>
                            <button class="theme-option-card" data-theme="spiritual" style="padding: 20px; border: 2px solid var(--border); border-radius: 15px; background: white; cursor: pointer; transition: 0.3s; display: flex; flex-direction: column; align-items: center;">
                                <div style="width: 50px; height: 50px; border-radius: 50%; background: #7e22ce; margin-bottom: 15px; border: 2px solid #e2e8f0;"></div>
                                <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Espiritual</span>
                            </button>
                        </div>
                    </div>
                `;
                    setTimeout(() => {
                        document.querySelectorAll('.theme-option-card').forEach(btn => {
                            // Highlight current theme
                            const currentTheme = localStorage.getItem('sebitam-theme') || 'professional';
                            if (btn.dataset.theme === currentTheme) {
                                btn.style.borderColor = 'var(--primary)';
                                btn.style.background = 'rgba(var(--primary-rgb), 0.05)';
                            }

                            btn.onclick = () => {
                                const theme = btn.dataset.theme;
                                // Safe class removal to preserve user role and other classes
                                document.body.classList.remove('theme-man', 'theme-woman', 'theme-professional', 'theme-elegant', 'theme-nature', 'theme-spiritual');
                                document.body.classList.add(`theme-${theme}`);

                                localStorage.setItem('sebitam-theme', theme);

                                // Visual feedback
                                document.querySelectorAll('.theme-option-card').forEach(b => {
                                    b.style.borderColor = 'var(--border)';
                                    b.style.background = 'white';
                                });
                                btn.style.borderColor = 'var(--primary)';
                                btn.style.background = 'rgba(var(--primary-rgb), 0.05)';

                                alert(`Tema ${btn.querySelector('span').textContent} aplicado!`);
                            };
                        });
                        lucide.createIcons();
                    }, 0);
                    break;

                case 'institucional':
                    html = `
                    <div class="view-header">
                        <h2>Sebitam Institucional</h2>
                        <p>Nossa missão, visão e compromisso com o Reino.</p>
                    </div>
                    <div class="welcome-card" style="line-height: 1.8; text-align: left; padding: 40px; margin-bottom: 40px;">
                        <div style="max-width: 800px; margin: 0 auto;">
                            <h3 style="color: white; margin-bottom: 25px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px; font-size: 1.5rem;">Identidade e Propósito</h3>
                            
                            <p style="margin-bottom: 20px; font-size: 1.1rem;">
                                O <strong>SEBITAM</strong> é um seminário bíblico teológico comprometido com o Reino de Deus. 
                                Fundado para servir à Igreja de Jesus e além dela, seu propósito é formar líderes cristãos íntegros e relevantes.
                            </p>

                            <div style="background: rgba(0,0,0,0.2); padding: 25px; border-radius: 15px; margin-bottom: 25px; border-left: 4px solid var(--primary);">
                                <p style="margin-bottom: 15px;"><strong>O SEBITAM existe para glorificar a Deus em tudo o que faz.</strong></p>
                                <p>Promove o estudo sério e fiel das Escrituras Sagradas, valorizando a missão integral da Igreja no mundo.</p>
                            </div>

                            <p style="margin-bottom: 20px;">
                                Sua missão é capacitar homens e mulheres para o serviço cristão, preparando-os para ensinar, pastorear e servir com excelência. 
                                Buscamos o desenvolvimento espiritual, acadêmico e humano, cultivando caráter, ética e compromisso com o amor ao próximo.
                            </p>

                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
                                    <h4 style="color: white; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="target" style="width: 18px;"></i> Visão
                                    </h4>
                                    <p style="font-size: 0.9rem;">Ser referência em educação teológica na Amazônia, reconhecido pela fidelidade bíblica e relevância missional.</p>
                                </div>
                                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
                                    <h4 style="color: white; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="heart" style="width: 18px;"></i> Valores
                                    </h4>
                                    <p style="font-size: 0.9rem;">Unidade, humildade, excelência no serviço, responsabilidade social e fidelidade às Escrituras.</p>
                                </div>
                            </div>

                            <p style="margin-bottom: 20px;">
                                Estimulamos o pensamento crítico à luz da Palavra de Deus, promovendo unidade, humildade e espírito de serviço. 
                                Atuamos com responsabilidade social e sensibilidade cultural, formando discípulos que façam discípulos.
                            </p>

                            <p style="font-style: italic; opacity: 0.9; margin-top: 30px; text-align: center; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 20px;">
                                "Desejamos ver a Igreja fortalecida e saudável e proclamar a esperança transformadora de Jesus ao mundo."
                            </p>
                        </div>
                    </div>
                `;
                    setTimeout(() => lucide.createIcons(), 0);
                    break;

                case 'termo':
                    html = `
                    <div class="view-header">
                        <h2>Normas Sebitam</h2>
                        <p>Documentação oficial, diretrizes acadêmicas e regimento interno.</p>
                    </div>
                    
                    <div class="rules-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 25px; margin-top: 20px;">
                        
                        <!-- Card 1: Termo de Responsabilidade -->
                        <div class="rule-card" style="background: white; padding: 40px; border-radius: 25px; box-shadow: var(--shadow); border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; text-align: center; transition: var(--transition);">
                            <div class="rule-icon-box" style="width: 80px; height: 80px; border-radius: 20px; background: rgba(37, 99, 235, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; margin-bottom: 25px;">
                                <i data-lucide="file-signature" style="width: 38px; height: 38px;"></i>
                            </div>
                            <h3 style="font-size: 1.3rem; font-weight: 700; color: #1e293b; margin-bottom: 15px;">Normas Sebitam</h3>
                            <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 30px; line-height: 1.6;">
                                Documento oficial que estabelece os compromissos éticos e acadêmicos entre o aluno e a instituição.
                            </p>
                            <a href="https://drive.google.com/drive/folders/1us4CjRi8zJBbuLf9x4CjYTVUa-VT9UD3" target="_blank" class="btn-primary" style="width: 100%; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 600; padding: 15px;">
                                <i data-lucide="file-text"></i> Acessar PDF (Termo)
                            </a>
                        </div>

                        <!-- Card 2: Regimento Interno -->
                        <div class="rule-card" style="background: white; padding: 40px; border-radius: 25px; box-shadow: var(--shadow); border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; text-align: center; transition: var(--transition);">
                            <div class="rule-icon-box" style="width: 80px; height: 80px; border-radius: 20px; background: rgba(16, 185, 129, 0.1); color: #10b981; display: flex; align-items: center; justify-content: center; margin-bottom: 25px;">
                                <i data-lucide="book-open-check" style="width: 38px; height: 38px;"></i>
                            </div>
                            <h3 style="font-size: 1.3rem; font-weight: 700; color: #1e293b; margin-bottom: 15px;">Regimento Interno</h3>
                            <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 30px; line-height: 1.6;">
                                Conjunto de normas que regem o funcionamento acadêmico, administrativo e disciplinar do SEBITAM.
                            </p>
                            <a href="https://drive.google.com/drive/folders/1us4CjRi8zJBbuLf9x4CjYTVUa-VT9UD3" target="_blank" class="btn-primary" style="width: 100%; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 600; padding: 15px; background: #10b981;">
                                <i data-lucide="scroll"></i> Acessar PDF (Regimento)
                            </a>
                        </div>

                    </div>

                    <div style="margin-top: 40px; text-align: center; padding: 25px; background: rgba(30, 41, 59, 0.03); border-radius: 15px; border: 1.5px dashed #cbd5e1;">
                        <p style="font-size: 0.9rem; color: #64748b;">
                            <i data-lucide="info" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 5px;"></i>
                            Esses documentos são fundamentais para o bom convívio e organização da nossa comunidade acadêmica.
                        </p>
                    </div>
                `;
                    setTimeout(() => lucide.createIcons(), 0);
                    break;

                case 'finance': {
                    const allFinanceSt = await dbGet('sebitam-students');
                    const selectedGrade = data && data.grade ? data.grade : 'all';

                    const finStudents = selectedGrade === 'all'
                        ? allFinanceSt
                        : allFinanceSt.filter(s => s.grade == selectedGrade);

                    // Definição de valores monetários por plano
                    const PRICES = { integral: 70, half: 35, scholarship: 0 };

                    let totalExpected = 0;
                    let totalReceived = 0;

                    const processedPayments = finStudents.map(s => {
                        const status = s.paymentStatus || (['integral', 'scholarship'].includes(s.plan) ? 'Pago' : 'Pendente');
                        const value = PRICES[s.plan] || 0;
                        totalExpected += value;
                        if (status === 'Pago') totalReceived += value;
                        return { ...s, status, value };
                    });

                    const numPaid = processedPayments.filter(p => p.status === 'Pago').length;
                    const numPending = processedPayments.filter(p => p.status === 'Pendente').length;

                    const today = new Date();
                    today.setDate(1); // Set to 1st to prevent overflow
                    // Logic: Start from February. If today is Jan, show Feb (1). Else show current month.
                    // Note: getMonth() is 0-indexed.
                    if (today.getMonth() === 0) {
                        today.setMonth(1);
                    }
                    const displayMonth = today.toLocaleString('pt-BR', { month: 'long' });
                    const displayMonthCapitalized = displayMonth.charAt(0).toUpperCase() + displayMonth.slice(1);

                    html = `
                    <div class="view-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 20px;">
                        <div>
                            <h2>Painel Financeiro</h2>
                            <p>Visão de recebíveis com valores monetários e filtros.</p>
                        </div>
                        <div style="background: white; padding: 10px 20px; border-radius: 12px; border: 1px solid var(--border); display: flex; align-items: center; gap: 10px;">
                            <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Filtrar por Turma:</label>
                            <select id="finance-grade-filter" style="border: none; outline: none; background: transparent; font-weight: 700; color: var(--primary); cursor: pointer;">
                                <option value="all" ${selectedGrade === 'all' ? 'selected' : ''}>Todas as Turmas</option>
                                ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g => `<option value="${g}" ${selectedGrade == g ? 'selected' : ''}>Turma ${g}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    

                    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 30px; margin-bottom: 40px; align-items: start;">
                        
                        <!-- Left Column: Stats & Chart -->
                        <div style="display: flex; flex-direction: column; gap: 20px;">
                            
                            <!-- Stats Cards -->

                            <!-- Stats Cards -->
                            <div class="stat-card" style="background: white; border: 2px solid var(--primary); background: rgba(37, 99, 235, 0.05);">
                                <div class="stat-icon" style="background: var(--primary); color: white;"><i data-lucide="wallet"></i></div>
                                <div>
                                    <div class="stat-value" style="font-size: 1.8rem; color: var(--primary);">R$ ${allFinanceSt.reduce((acc, s) => acc + (PRICES[s.plan] || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <div class="stat-label">Total Geral (Todas as Turmas) - ${displayMonthCapitalized}</div>
                                </div>
                            </div>

                            <div class="stat-card" style="background: white;">
                                <div class="stat-icon" style="background: rgba(34, 197, 94, 0.1); color: #16a34a;"><i data-lucide="dollar-sign"></i></div>
                                <div>
                                    <div class="stat-value" style="font-size: 1.5rem;">R$ ${totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <div class="stat-label">Total Recebido (${displayMonthCapitalized})</div>
                                </div>
                            </div>

                            <div class="stat-card" style="background: white;">
                                <!-- Icon removed as requested -->
                                <div>
                                    <div class="stat-value" style="font-size: 1.5rem;">R$ ${(totalExpected - totalReceived).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <div class="stat-label">Total em Aberto (Seleção)</div>
                                </div>
                            </div>

                            <div class="stat-card" style="background: white;">
                                <div class="stat-icon" style="background: rgba(37, 99, 235, 0.1); color: #2563eb;"><i data-lucide="pie-chart"></i></div>
                                <div>
                                    <div class="stat-value" style="font-size: 1.5rem;">${((totalReceived / (totalExpected || 1)) * 100).toFixed(1)}%</div>
                                    <div class="stat-label">Taxa de Adimplência</div>
                                </div>
                            </div>

                            <!-- Payment Chart -->
                            <div class="stat-card" style="background: white; padding: 25px; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border);">
                                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px; font-weight: 700;">
                                    <i data-lucide="pie-chart" style="color: var(--primary); width: 18px; height: 18px;"></i> Panorama de Pagamentos
                                </h3>
                                <div style="height: 250px; width: 100%; position: relative;">
                                    <canvas id="paymentsChart"></canvas>
                                </div>
                                <div style="margin-top: 25px;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem;">
                                        <span style="color: #16a34a; font-weight: 600;">Pagos (${numPaid}):</span>
                                        <strong>R$ ${totalReceived.toLocaleString('pt-BR')}</strong>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                                        <span style="color: #dc2626; font-weight: 600;">Pendentes (${numPending}):</span>
                                        <strong>R$ ${(totalExpected - totalReceived).toLocaleString('pt-BR')}</strong>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <!-- Right Column: Spreadsheet -->
                        <div class="stat-card" style="background: white; padding: 25px; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border); height: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h3 style="display: flex; align-items: center; gap: 10px; font-weight: 700;">
                                    <i data-lucide="table" style="color: var(--primary);"></i> Recebimentos por Aluno
                                </h3>
                                <span class="badge" style="background: var(--primary-light); color: var(--primary);">${finStudents.length} Alunos</span>
                            </div>
                            <div class="table-container" style="max-height: 800px; overflow-y: auto;">
                                <table class="data-table" style="font-size: 0.85rem;">
                                    <thead>
                                        <tr>
                                            <th>Aluno</th>
                                            <th>Plano</th>
                                            <th>Valor</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${processedPayments.map(p => {
                        let stColor, stIcon, stBg, stLabel;

                        if (p.plan === 'scholarship') {
                            stLabel = 'Bolsista';
                            stColor = '#a855f7'; // Purple
                            stBg = 'rgba(168, 85, 247, 0.1)';
                            stIcon = 'graduation-cap';
                        } else if (p.status === 'Pago') {
                            stLabel = 'Pago';
                            if (p.plan === 'half') {
                                stColor = '#3b82f6'; // Blue
                                stBg = 'rgba(59, 130, 246, 0.1)';
                            } else {
                                stColor = '#16a34a'; // Green
                                stBg = 'rgba(34, 197, 94, 0.1)';
                            }
                            stIcon = 'check-circle';
                        } else {
                            stLabel = 'Pendente';
                            stColor = '#dc2626'; // Red
                            stBg = 'rgba(239, 68, 68, 0.1)';
                            stIcon = 'alert-circle';
                        }

                        return `
                                            <tr>
                                                <td style="display: flex; align-items: center; gap: 8px;">
                                                    <div style="background: ${stBg}; padding: 4px; border-radius: 50%; display: flex; text-align: center; justify-content: center;">
                                                        <i data-lucide="${stIcon}" style="width: 14px; height: 14px; color: ${stColor};"></i>
                                                    </div>
                                                    <strong>${p.fullName}</strong>
                                                </td>
                                                <td>
                                                    <span class="badge" style="background: transparent; border: 1px solid #cbd5e1; color: #64748b; font-size: 0.7rem; display: inline-flex; align-items: center;">
                                                        ${p.plan === 'scholarship' ? '<i data-lucide="graduation-cap" style="width:12px; height:12px; margin-right:4px;"></i>' : ''}
                                                        ${p.plan === 'integral' ? 'Integral' : p.plan === 'half' ? 'Parcial' : 'Bolsista'}
                                                    </span>
                                                </td>
                                                <td>R$ ${p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td>
                                                    <span class="badge" style="background: ${stBg}; color: ${stColor}; border: 1px solid ${stColor}; display: inline-flex; align-items: center; gap: 5px;">
                                                        <i data-lucide="${stIcon}" style="width: 12px; height: 12px;"></i>
                                                        ${stLabel}
                                                    </span>
                                                </td>
                                            </tr>
                                        `;
                    }).join('')}
                                        ${processedPayments.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 30px;">Nenhum aluno encontrado para esta turma.</td></tr>' : ''}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 40px; background: white; padding: 25px; border-radius: 20px; box-shadow: var(--shadow); border: 1px solid var(--border);">
                        <div class="view-header" style="margin-bottom: 20px;">
                            <h3 style="display: flex; align-items: center; gap: 10px; font-weight: 700;">
                                <i data-lucide="file-text" style="color: var(--primary);"></i> Relatórios Mensais
                            </h3>
                            <p>Gere e imprima relatórios financeiros detalhados por mês.</p>
                        </div>
                        <div class="table-container">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Mês</th>
                                        <th>Ano</th>
                                        <th>Status do Relatório</th>
                                        <th class="text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Array.from({ length: 11 }, (_, i) => {
                        const date = new Date(new Date().getFullYear(), i + 1, 1);
                        const monthName = date.toLocaleString('pt-BR', { month: 'long' });
                        const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                        const year = date.getFullYear();
                        const isPastOrCurrent = i <= new Date().getMonth();

                        return `
                                            <tr>
                                                <td style="font-weight: 600;">${monthNameCap}</td>
                                                <td>${year}</td>
                                                <td>
                                                    <span class="badge" style="background: ${isPastOrCurrent ? 'rgba(34, 197, 94, 0.1)' : 'rgba(241, 245, 249, 1)'}; color: ${isPastOrCurrent ? '#16a34a' : '#64748b'}; border: 1px solid ${isPastOrCurrent ? '#22c55e' : '#cbd5e1'};">
                                                        ${isPastOrCurrent ? 'Disponível' : 'Futuro'}
                                                    </span>
                                                </td>
                                                <td class="actions-cell">
                                                    <button class="btn-icon" title="Imprimir Relatório" onclick="printFinancialReport(${i}, ${year})" style="color: var(--primary); background: rgba(37, 99, 235, 0.1);">
                                                        <i data-lucide="printer"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `;
                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;


                    setTimeout(() => {
                        if (typeof Chart === 'undefined') return;

                        const filter = document.getElementById('finance-grade-filter');
                        if (filter) {
                            filter.onchange = (e) => renderView('finance', { grade: e.target.value });
                        }

                        const ctxPayments = document.getElementById('paymentsChart');
                        if (ctxPayments) {
                            new Chart(ctxPayments, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Recebido', 'Inadimplência'],
                                    datasets: [{
                                        data: [totalReceived, totalExpected - totalReceived],
                                        backgroundColor: ['#22c55e', '#ef4444'],
                                        borderWidth: 0,
                                        hoverOffset: 15
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'bottom', labels: { usePointStyle: true, font: { family: 'Outfit', size: 12 } } }
                                    }
                                }
                            });
                        }
                        lucide.createIcons();
                    }, 100);
                    break;
                }
                case 'theology-ai':
                case 'chat-sebitam': {
                    // ============================================================
                    // CHAT COM SUPABASE REALTIME
                    // ============================================================
                    const isSebitam = view === 'chat-sebitam';
                    const isTeacherChat = ['admin', 'teacher'].includes(currentUser.role);
                    const canDeleteChat = ['admin', 'teacher'].includes(currentUser.role);

                    let selectedTurmaChat = window.currentChatTurma || 1;
                    // Removida a trava que forçava a turma do aluno, agora todos podem navegar pelas 10 turmas

                    // Canal da conversa: 'sebitam-turma-1' ... 'ibma'
                    const canalChat = isSebitam
                        ? `sebitam-turma-${selectedTurmaChat}`
                        : 'ibma';

                    // Utilitário: tempo relativo
                    const tempoRelativo = (isoOrMs) => {
                        const d = new Date(isoOrMs);
                        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
                        if (diff < 60) return 'agora';
                        if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
                        if (diff < 86400) {
                            const h = Math.floor(diff / 3600);
                            const m = Math.floor((diff % 3600) / 60);
                            return m > 0 ? `há ${h}h ${m}min` : `há ${h}h`;
                        }
                        const dias = Math.floor(diff / 86400);
                        if (dias < 7) return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
                        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                    };

                    // Constrói o HTML de uma mensagem
                    const buildMsgHTML = (m, idx) => {
                        const isOwn = m.autor === currentUser.name;
                        const roleLabel = m.role === 'admin' ? '👑 Admin' : m.role === 'teacher' ? '📚 Professor' : '🎓 Aluno';
                        const canDel = canDeleteChat || m.autor === currentUser.name;
                        const idBtn = `del-msg-${m.id || idx}`;
                        const ts = tempoRelativo(m.created_at || m.time);
                        return `
                        <div class="message ${isOwn ? 'user' : 'ai'}" data-msg-id="${m.id || idx}">
                            <div class="msg-bubble shadow-sm" style="position: relative; max-width: 75%;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 4px;">
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span style="font-size: 0.78rem; font-weight: 700; color: ${isOwn ? 'rgba(255,255,255,0.85)' : 'var(--primary)'};">${m.autor}</span>
                                        <span style="font-size: 0.7rem; opacity: 0.7; background: rgba(0,0,0,0.08); border-radius: 20px; padding: 1px 7px;">${roleLabel}</span>
                                    </div>
                                    ${canDel ? `<button id="${idBtn}" data-id="${m.id}" data-idx="${idx}" class="chat-delete-btn" style="background:none; border:none; padding:2px; cursor:pointer; color: ${isOwn ? 'rgba(255,255,255,0.6)' : '#ef4444'}; opacity: 0.7; flex-shrink:0;" title="Excluir mensagem">
                                        <i data-lucide="trash-2" style="width: 13px; height: 13px; pointer-events:none;"></i>
                                    </button>` : ''}
                                </div>
                                <div style="line-height: 1.55; word-break: break-word;">${m.texto.replace(/\n/g, '<br>')}</div>
                                <div style="font-size: 0.7rem; opacity: 0.6; margin-top: 5px; text-align: right;">${ts}</div>
                            </div>
                        </div>`;
                    };

                    // Renderiza lista de mensagens no container
                    const renderMsgs = (list) => {
                        const el = document.getElementById('chat-messages');
                        if (!el) return;
                        if (list.length === 0) {
                            el.innerHTML = `<div class="message ai">
                            <div class="msg-bubble shadow-sm" style="opacity:0.7;">
                                <i data-lucide="message-circle" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"></i>
                                Nenhuma mensagem ainda. Seja o primeiro a conversar!
                            </div>
                        </div>`;
                        } else {
                            el.innerHTML = list.map((m, idx) => buildMsgHTML(m, idx)).join('');
                            // Vincular botões de deletar
                            el.querySelectorAll('.chat-delete-btn').forEach(btn => {
                                btn.addEventListener('click', () => window.chatDeleteMsg(btn.dataset.id, btn.dataset.idx));
                            });
                        }
                        el.scrollTop = el.scrollHeight;
                        if (window.lucide) window.lucide.createIcons();
                    };

                    // Gera opções de turma 1–10
                    const turmaOptions = Array.from({ length: 10 }, (_, i) => i + 1)
                        .map(n => `<option value="${n}" ${selectedTurmaChat == n ? 'selected' : ''}>Turma ${n}</option>`)
                        .join('');

                    html = `
                    <div class="view-header">
                        <div style="display: flex; align-items: center; gap: 15px; width: 100%; flex-wrap: wrap;">
                            <div style="width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), #818cf8); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 14px rgba(37,99,235,0.35);">
                                <i data-lucide="message-circle" style="width: 26px; height: 26px; color: white;"></i>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                    <h2 style="margin:0; font-size:1.3rem;">
                                        Chat ${isSebitam ? 'SEBITAM' : 'Escolas IBMA'}
                                    </h2>
                                    <span id="chat-status-badge" style="display:inline-flex; align-items:center; gap:5px; font-size:0.72rem; background:#fef9c3; color:#854d0e; border:1px solid #fde047; border-radius:20px; padding:2px 10px; font-weight:600;">
                                        <span style="width:7px;height:7px;border-radius:50%;background:#eab308;display:inline-block;"></span> Conectando...
                                    </span>
                                    ${isSebitam ? `
                                        <select id="chat-turma-selector" style="margin-left:auto; padding:5px 12px; border-radius:8px; border:1px solid var(--border); font-size:0.9rem; background:white; color:var(--text-main); font-family:inherit; cursor:pointer; box-shadow:var(--shadow-sm);">
                                            ${turmaOptions}
                                        </select>
                                    ` : ''}
                                </div>
                                <p style="margin:4px 0 0; color:var(--text-muted); font-size:0.85rem;">
                                    <i data-lucide="zap" style="width:13px;height:13px;vertical-align:middle;color:#22c55e;margin-right:3px;"></i>
                                    Mensagens em tempo real ${isSebitam ? '· ' + 'Turma ' + selectedTurmaChat : ''}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="chat-container" style="display:flex; flex-direction:column; height: calc(100vh - 260px); min-height:400px;">
                        <div class="chat-messages" id="chat-messages" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:12px;">
                            <div class="message ai">
                                <div class="msg-bubble shadow-sm" style="opacity:0.6; display:flex; align-items:center; gap:8px;">
                                    <div class="chat-typing-dots"><span></span><span></span><span></span></div>
                                    Carregando mensagens...
                                </div>
                            </div>
                        </div>
                        <div class="chat-input-area" style="flex-shrink:0;">
                            <div class="chat-input-wrapper" style="border-radius:16px; align-items:flex-end; padding:12px 20px; gap:15px;">
                                <textarea id="chat-input" placeholder="Digite sua mensagem... (Enter para enviar, Shift+Enter para nova linha)"
                                    style="flex:1; border:none; outline:none; font-size:0.97rem; padding:8px 0; min-height:50px; max-height:150px; resize:none; background:transparent; font-family:inherit; line-height:1.55;"></textarea>
                                <button class="chat-send-btn" id="send-chat-btn" style="width:50px; height:50px; flex-shrink:0; border-radius:12px; margin-bottom:4px;" title="Enviar mensagem">
                                    <i data-lucide="send" style="width:22px; height:22px;"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                    setTimeout(async () => {
                        const chatMessagesEl = document.getElementById('chat-messages');
                        const chatInputEl = document.getElementById('chat-input');
                        const sendBtnEl = document.getElementById('send-chat-btn');
                        const statusBadge = document.getElementById('chat-status-badge');

                        // Cancelar subscription anterior se existir (troca de turma, etc.)
                        if (window._chatRealtimeChannel) {
                            try { await supabase.removeChannel(window._chatRealtimeChannel); } catch (_) { }
                            window._chatRealtimeChannel = null;
                        }

                        // ---- Função de exclusão de mensagem ----
                        window.chatDeleteMsg = async (msgId, fallbackIdx) => {
                            if (!canDeleteChat) return;
                            if (!confirm('Excluir esta mensagem?')) return;
                            try {
                                if (supabase && msgId && msgId !== 'undefined') {
                                    const { error } = await supabase
                                        .from('mensagens')
                                        .delete()
                                        .eq('id', msgId);
                                    if (error) throw error;
                                    // A exclusão será refletida via realtime (ou re-fetch)
                                    // Por segurança, re-fetch
                                    await fetchAndRender();
                                } else {
                                    // Fallback localStorage
                                    const list = safeLocalGet();
                                    list.splice(Number(fallbackIdx), 1);
                                    localStorage.setItem(`chat-${canalChat}`, JSON.stringify(list));
                                    renderMsgs(list);
                                }
                            } catch (err) {
                                console.error('Erro ao deletar mensagem:', err);
                                alert('Erro ao excluir mensagem.');
                            }
                        };

                        // ---- Buscar mensagens iniciais ----
                        const fetchAndRender = async () => {
                            try {
                                if (supabase) {
                                    const { data, error } = await supabase
                                        .from('mensagens')
                                        .select('*')
                                        .eq('canal', canalChat)
                                        .order('created_at', { ascending: true })
                                        .limit(200);
                                    if (error) throw error;
                                    // Salvar cópia no localStorage como cache
                                    localStorage.setItem(`chat-${canalChat}`, JSON.stringify(data));
                                    renderMsgs(data);
                                } else {
                                    throw new Error('Supabase não disponível');
                                }
                            } catch (err) {
                                console.warn('Chat: usando localStorage como fallback.', err);
                                const cached = safeLocalGet();
                                // Normalizar formato antigo (time → created_at, text → texto, author → autor)
                                const normalized = cached.map((m, i) => ({
                                    id: m.id || i,
                                    canal: canalChat,
                                    autor: m.autor || m.author || currentUser.name,
                                    role: m.role || 'student',
                                    texto: m.texto || m.text || '',
                                    created_at: m.created_at || new Date(m.time || Date.now()).toISOString()
                                }));
                                renderMsgs(normalized);
                                if (statusBadge) {
                                    statusBadge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#f97316;display:inline-block;"></span> Offline (cache)`;
                                    statusBadge.style.background = '#fff7ed';
                                    statusBadge.style.color = '#9a3412';
                                    statusBadge.style.borderColor = '#fdba74';
                                }
                            }
                        };

                        await fetchAndRender();

                        // ---- Configurar Supabase Realtime ----
                        if (supabase) {
                            try {
                                const channel = supabase
                                    .channel(`chat-realtime-${canalChat}-${Date.now()}`)
                                    .on('postgres_changes', {
                                        event: 'INSERT',
                                        schema: 'public',
                                        table: 'mensagens',
                                        filter: `canal=eq.${canalChat}`
                                    }, (payload) => {
                                        // Adicionar nova mensagem ao DOM sem re-renderizar tudo
                                        const list = safeLocalGet();
                                        const exists = list.some(m => m.id === payload.new.id);
                                        if (!exists) {
                                            list.push(payload.new);
                                            localStorage.setItem(`chat-${canalChat}`, JSON.stringify(list));
                                            // Inserir no DOM incrementalmente
                                            if (chatMessagesEl) {
                                                // Remover mensagem vazia de boas vindas se existir
                                                const emptyMsg = chatMessagesEl.querySelector('.chat-empty-hint');
                                                if (emptyMsg) emptyMsg.remove();
                                                const wrapper = document.createElement('div');
                                                wrapper.innerHTML = buildMsgHTML(payload.new, list.length - 1);
                                                const node = wrapper.firstElementChild;
                                                chatMessagesEl.appendChild(node);
                                                // Vincular botão deletar
                                                const delBtn = node.querySelector('.chat-delete-btn');
                                                if (delBtn) {
                                                    delBtn.addEventListener('click', () => window.chatDeleteMsg(delBtn.dataset.id, delBtn.dataset.idx));
                                                }
                                                chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
                                                if (window.lucide) window.lucide.createIcons();
                                            }
                                        }
                                    })
                                    .on('postgres_changes', {
                                        event: 'DELETE',
                                        schema: 'public',
                                        table: 'mensagens',
                                        filter: `canal=eq.${canalChat}`
                                    }, (payload) => {
                                        // Remover mensagem do DOM
                                        const el = chatMessagesEl && chatMessagesEl.querySelector(`[data-msg-id="${payload.old.id}"]`);
                                        if (el) el.remove();
                                        // Atualizar cache
                                        const list = safeLocalGet()
                                            .filter(m => String(m.id) !== String(payload.old.id));
                                        localStorage.setItem(`chat-${canalChat}`, JSON.stringify(list));
                                    })
                                    .subscribe((status) => {
                                        if (!statusBadge) return;
                                        if (status === 'SUBSCRIBED') {
                                            statusBadge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;"></span> Ao vivo`;
                                            statusBadge.style.background = '#f0fdf4';
                                            statusBadge.style.color = '#15803d';
                                            statusBadge.style.borderColor = '#86efac';
                                        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                                            statusBadge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block;"></span> Erro de conexão`;
                                            statusBadge.style.background = '#fef2f2';
                                            statusBadge.style.color = '#b91c1c';
                                            statusBadge.style.borderColor = '#fca5a5';
                                        }
                                    });

                                window._chatRealtimeChannel = channel;
                            } catch (realtimeErr) {
                                console.warn('Realtime não disponível:', realtimeErr);
                            }
                        }

                        // ---- Enviar mensagem ----
                        const handleSendChat = async () => {
                            const text = chatInputEl ? chatInputEl.value.trim() : '';
                            if (!text) return;
                            const role = isTeacherChat ? (currentUser.role === 'admin' ? 'admin' : 'teacher') : 'student';
                            const novaMensagem = {
                                canal: canalChat,
                                autor: currentUser.name,
                                role,
                                texto: text
                            };

                            // Desabilitar botão temporariamente (feedback visual)
                            if (sendBtnEl) {
                                sendBtnEl.disabled = true;
                                sendBtnEl.style.opacity = '0.5';
                            }
                            if (chatInputEl) chatInputEl.value = '';

                            try {
                                if (supabase) {
                                    const { error } = await supabase.from('mensagens').insert([novaMensagem]);
                                    if (error) throw error;
                                    // O Realtime vai capturar e exibir — não precisamos fazer nada aqui
                                } else {
                                    throw new Error('Supabase offline');
                                }
                            } catch (err) {
                                console.warn('Salvando no localStorage (fallback):', err);
                                // Fallback: salvar localmente e mostrar
                                const offline = {
                                    ...novaMensagem,
                                    id: Date.now(),
                                    created_at: new Date().toISOString()
                                };
                                const list = safeLocalGet();
                                list.push(offline);
                                localStorage.setItem(`chat-${canalChat}`, JSON.stringify(list));
                                renderMsgs(list);
                            } finally {
                                if (sendBtnEl) {
                                    sendBtnEl.disabled = false;
                                    sendBtnEl.style.opacity = '1';
                                }
                                if (chatInputEl) chatInputEl.focus();
                            }
                        };

                        if (sendBtnEl) sendBtnEl.onclick = handleSendChat;
                        if (chatInputEl) {
                            chatInputEl.onkeydown = (e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
                            };
                        }

                        // ---- Troca de turma (Todos no SEBITAM) ----
                        if (isSebitam) {
                            const selectorEl = document.getElementById('chat-turma-selector');
                            if (selectorEl) {
                                selectorEl.addEventListener('change', async (e) => {
                                    window.currentChatTurma = e.target.value;
                                    // Cancelar subscription atual antes de trocar
                                    if (window._chatRealtimeChannel) {
                                        try { await supabase.removeChannel(window._chatRealtimeChannel); } catch (_) { }
                                        window._chatRealtimeChannel = null;
                                    }
                                    renderView(view);
                                });
                            }
                        }

                        lucide.createIcons();
                    }, 0);
                    break;
                }
            }
            if (html && contentBody) contentBody.innerHTML = html;
            if (window.lucide) window.lucide.createIcons();
        }

        async function updatePaymentStatus(studentId, status) {
            try {
                console.log(`Atualizando pagamento: ID ${studentId} para ${status}`);
                await dbUpdateItem('sebitam-students', studentId, { paymentStatus: status });
                console.log("Pagamento atualizado com sucesso!");
                alert(`Status de pagamento alterado para: ${status}`);
                await renderView('classes');
            } catch (err) {
                console.error("Erro ao atualizar pagamento:", err);
                alert("Erro ao atualizar pagamento: " + err.message);
            }
        }

        // Export functions to window for onclick handlers
        window.renderGradeEditor = renderGradeEditor;
        window.generateCertificate = generateCertificate;
        window.printAcademicHistory = printAcademicHistory;
        window.updatePaymentStatus = updatePaymentStatus;
        window.printFinancialReport = printFinancialReport;
        window.renderEditStudent = renderEditStudent;

        // Profile Icon Logic (Restored)
        const avatarContainer = document.getElementById('profile-avatar-container');
        const profileUpload = document.getElementById('profile-upload');
        const userAvatarIcon = document.getElementById('user-avatar-icon');

        if (avatarContainer && profileUpload) {
            avatarContainer.addEventListener('click', () => {
                profileUpload.click();
            });

            profileUpload.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (event) => {
                    const base64 = event.target.result;

                    // Update UI immediately
                    if (userAvatarIcon) {
                        // Create img if doesn't exist or update
                        let img = avatarContainer.querySelector('img');
                        if (!img) {
                            img = document.createElement('img');
                            img.style.width = '100%';
                            img.style.height = '100%';
                            img.style.objectFit = 'cover';
                            img.style.borderRadius = '50%';
                            avatarContainer.appendChild(img);
                            userAvatarIcon.style.display = 'none'; // Hide icon
                        }
                        img.src = base64;
                    }

                    // Update Data
                    if (currentUser) {
                        currentUser.photo = base64;

                        // Determine collection
                        let collection = 'sebitam-students'; // default
                        if (currentUser.role === 'admin') collection = 'sebitam-admins';
                        if (currentUser.role === 'teacher') collection = 'sebitam-teachers';
                        if (currentUser.role === 'secretary') collection = 'sebitam-secretaries';

                        try {
                            await dbUpdateItem(collection, currentUser.id, { photo: base64 });
                            // Also update local storage user key if used
                            const userKey = `sebitam-user-${currentUser.email}`;
                            if (localStorage.getItem(userKey)) {
                                // Logic to update stored user if needed, usually we re-fetch on login
                            }
                        } catch (err) {
                            console.error('Error saving photo:', err);
                            alert('Erro ao salvar foto.');
                        }
                    }
                };
                reader.readAsDataURL(file);
            });
        }

        // Function to show avatar if exists
        function updateAvatarUI(user) {
            if (!avatarContainer) return;
            const existingImg = avatarContainer.querySelector('img');
            if (existingImg) existingImg.remove();
            const icon = document.getElementById('user-avatar-icon');

            if (user && user.photo) {
                const img = document.createElement('img');
                img.src = user.photo;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '50%';
                avatarContainer.appendChild(img);
                if (icon) icon.style.display = 'none';
            } else {
                if (icon) icon.style.display = 'block';
            }
        }
        window.updateAvatarUI = updateAvatarUI;

        // Super Admin Auto-Registration
        async function checkAndRegisterSuperAdmin() {
            if (!supabase) return;
            const superAdminEmail = 'edukadoshmda@gmail.com';
            const superAdminName = 'Luiz Eduardo Santos da Silva';

            try {
                // Usando o nome correto da tabela em inglês
                const { data, error } = await supabase.from('administradores').select('*').eq('email', superAdminEmail);
                if (error) throw error;

                if (data.length === 0) {
                    console.log("Registrando Super Administrador...");
                    await supabase.from('administradores').insert([{
                        name: superAdminName,
                        email: superAdminEmail,
                        phone: 'Gestor'
                    }]);
                }
            } catch (e) {
                if (isNetworkError(e)) console.warn("⚠️ Sem conexão com Supabase; auto-registro ignorado.");
                else console.error("Erro no auto-registro:", e);
            }
        }

        // Run check em background; pré-render overview sem bloquear
        checkAndRegisterSuperAdmin()
            .then(() => { try { renderView('overview'); } catch (e) { console.warn('renderView overview:', e); } })
            .catch(() => { /* falha silenciosa - login continua funcionando */ });
    } catch (err) {
        console.error('Erro crítico ao carregar SEBITAM:', err);
        document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif;"><h2>Erro ao carregar</h2><p>Recarregue a página (Ctrl+F5 para limpar cache).</p><button onclick="location.reload(true)" style="padding:12px 24px;background:#0f172a;color:white;border:none;border-radius:8px;cursor:pointer;">Recarregar</button></div>';
    }
});
