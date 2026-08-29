import cors from 'cors';
import express from 'express';
import { env } from './config.js';
import { errorHandler } from './utils/errors.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { productsRouter } from './routes/products.js';
import { purchasesRouter } from './routes/purchases.js';
import { inventoryRouter } from './routes/inventory.js';
import { stocktakesRouter } from './routes/stocktakes.js';
import { salesRouter } from './routes/sales.js';
import { opsRouter } from './routes/ops.js';
import { dashboardRouter } from './routes/dashboard.js';
import { usersRouter } from './routes/users.js';
import { notificationsRouter } from './routes/notifications.js';
import { pushRouter } from './routes/push.js';
import { reportsRouter } from './routes/reports.js';
import { uploadsDir, uploadsRouter } from './routes/uploads.js';

const app = express();
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'lscala-api', provider: 'Atria Solutions SpA', client: "L'Scala" });
});

app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/products', productsRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/stocktakes', stocktakesRouter);
app.use('/api/sales', salesRouter);
app.use('/api/ops', opsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/users', usersRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/push', pushRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/uploads', uploadsRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`L'Scala API listening on http://localhost:${env.port}`);
});
