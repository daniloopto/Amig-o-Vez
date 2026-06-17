# Vez de Atendimento — Óticas Amigão

App de organização da vez de atendimento dos vendedores, com registro de conversão,
fila em tempo real, PIN por vendedor e painéis de diretoria/supervisão.

Stack: React + Vite + Supabase. Deploy: Netlify.

---

## Passo 1 — Banco de dados (Supabase)

1. Crie um **projeto novo** em https://supabase.com.
2. Vá em **SQL Editor → New query**, cole TODO o conteúdo de `amigao-supabase.sql` e clique **Run**.
   - Isso cria as tabelas, as regras de segurança, as funções de PIN, e já cadastra
     as 11 lojas e os 54 vendedores (PINs com hash).
3. **Reset diário automático:** vá em **Database → Extensions**, ative `pg_cron`.
   Depois volte ao SQL Editor e rode:
   ```sql
   select cron.schedule('amigao-reset-diario','0 3 * * *',
     $$update vendedores set status='fora', inicio=null$$);
   ```
   (03:00 UTC = 00:00 de Brasília — todos voltam a "indisponível" a cada dia.)
4. **Crie os logins** em **Authentication → Users → Add user** (Auto-confirm),
   com EXATAMENTE estes e-mails e as senhas:

   | E-mail | Senha | Acesso |
   |---|---|---|
   | danilo@oticasamigao.com | danilo1708 | Diretoria (tudo) |
   | amanda@oticasamigao.com | amanda1708 | Supervisão (8 lojas) |
   | oberdan@oticasamigao.com | oberdan1708 | Supervisão (3 lojas) |
   | saracuruna@oticasamigao.com | amigao123 | Loja |
   | lotexv@oticasamigao.com | amigao123 | Loja |
   | vilasaoluis@oticasamigao.com | amigao123 | Loja |
   | piabeta@oticasamigao.com | amigao123 | Loja |
   | mage@oticasamigao.com | amigao123 | Loja |
   | ilhadogovernador@oticasamigao.com | amigao123 | Loja |
   | caxias@oticasamigao.com | amigao123 | Loja |
   | austin@oticasamigao.com | amigao123 | Loja |
   | voltaredonda@oticasamigao.com | amigao123 | Loja |
   | barramansa@oticasamigao.com | amigao123 | Loja |
   | retiro@oticasamigao.com | amigao123 | Loja |

---

## Passo 2 — Chaves do projeto

Em **Project Settings → API**, copie:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

(A chave `anon` é pública e pode ficar no front-end; a segurança é garantida pelo RLS.)

---

## Passo 3 — Subir no Netlify (mesmo fluxo do Amigão Check)

1. Crie um repositório no GitHub e suba estes arquivos
   (ou cole pela edição web, como você já faz).
2. No Netlify: **Add new site → Import from GitHub** e selecione o repositório.
3. Build settings (o `netlify.toml` já cuida disso): build `npm run build`, publish `dist`.
4. Em **Site settings → Environment variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Pronto — o app abre na tela de login.

---

## Rodar localmente (opcional)

```bash
npm install
cp .env.example .env   # preencha as duas variáveis
npm run dev
```

---

## Notas

- **PIN:** nunca trafega nem aparece na tela. A validação acontece no banco (funções
  `fn_iniciar`, `fn_finalizar`, `fn_ficar_disponivel`). Para trocar um PIN, use a
  diretoria → loja → Vendedores → ícone da chave.
- **Fila:** FIFO por disponibilidade — quem fica disponível primeiro atende primeiro;
  ao finalizar, volta para o fim da fila.
- **Tempo real:** a fila e a conversão atualizam sozinhas em todos os aparelhos da loja.
- **Reset diário:** todos começam o dia indisponíveis; os contadores são por dia
  (fuso de Brasília), então "hoje" zera sozinho à meia-noite.
