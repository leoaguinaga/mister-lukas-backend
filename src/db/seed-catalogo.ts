import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, inArray } from 'drizzle-orm';
import * as schema from './schema';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  // ─── Insumos con stock inicial del día de apertura ────────────────────────
  // stockActual está en unidades mínimas (octavos, botellas, etc.)

  const insumos = [
    { nombre: 'Pollo entero',        unidadesPorUnidadDeCompra: 8,  nombreUnidadMinima: 'octavo',  stockActual: 40 }, // 5 pollos = 40 octavos
    { nombre: 'Inca Kola 500ml',     unidadesPorUnidadDeCompra: 1,  nombreUnidadMinima: 'botella', stockActual: 24 },
    { nombre: 'Coca Cola 500ml',     unidadesPorUnidadDeCompra: 1,  nombreUnidadMinima: 'botella', stockActual: 24 },
    { nombre: 'Sprite 500ml',        unidadesPorUnidadDeCompra: 1,  nombreUnidadMinima: 'botella', stockActual: 0  }, // sin stock → no disponible
    { nombre: 'Inca Kola 1.5L',      unidadesPorUnidadDeCompra: 1,  nombreUnidadMinima: 'botella', stockActual: 12 },
    { nombre: 'Coca Cola 1.5L',      unidadesPorUnidadDeCompra: 1,  nombreUnidadMinima: 'botella', stockActual: 12 },
    { nombre: 'Agua San Luis 500ml', unidadesPorUnidadDeCompra: 1,  nombreUnidadMinima: 'botella', stockActual: 24 },
    { nombre: 'Cerveza Cusqueña 620ml', unidadesPorUnidadDeCompra: 1, nombreUnidadMinima: 'botella', stockActual: 12 },
    { nombre: 'Cerveza Pilsen 620ml',   unidadesPorUnidadDeCompra: 1, nombreUnidadMinima: 'botella', stockActual: 0  }, // sin stock → no disponible
  ];

  const insumoMap: Record<string, { id: string; stockActual: number }> = {};

  for (const data of insumos) {
    const [existing] = await db.select().from(schema.insumo).where(eq(schema.insumo.nombre, data.nombre));
    if (existing) {
      // Actualizar stock aunque el insumo ya exista
      await db.update(schema.insumo).set({ stockActual: data.stockActual }).where(eq(schema.insumo.id, existing.id));
      insumoMap[data.nombre] = { id: existing.id, stockActual: data.stockActual };
      console.log(`↻ Insumo actualizado: ${data.nombre} (stock: ${data.stockActual})`);
    } else {
      const [row] = await db.insert(schema.insumo).values(data).returning();
      insumoMap[data.nombre] = { id: row.id, stockActual: data.stockActual };
      console.log(`✓ Insumo creado: ${data.nombre} (stock: ${data.stockActual})`);
    }
  }

  // ─── Platos de la carta ───────────────────────────────────────────────────

  type CatInv = 'fraccionable' | 'reventa' | 'multi_insumo';
  const platos: Array<{
    nombre: string;
    precio: string;
    categoriaInventario: CatInv;
    receta?: { insumo: string; cantidad: number };
  }> = [
    // Pollo a la brasa (fraccionable — stock desde insumo "Pollo entero")
    { nombre: '1/8 Pollo a la brasa',   precio: '12.00', categoriaInventario: 'fraccionable', receta: { insumo: 'Pollo entero', cantidad: 1 } },
    { nombre: '1/4 Pollo a la brasa',   precio: '22.00', categoriaInventario: 'fraccionable', receta: { insumo: 'Pollo entero', cantidad: 2 } },
    { nombre: '1/2 Pollo a la brasa',   precio: '40.00', categoriaInventario: 'fraccionable', receta: { insumo: 'Pollo entero', cantidad: 4 } },
    { nombre: 'Pollo entero a la brasa',precio: '75.00', categoriaInventario: 'fraccionable', receta: { insumo: 'Pollo entero', cantidad: 8 } },

    // Bebidas (reventa — stock 1:1 con el insumo)
    { nombre: 'Inca Kola 500ml',        precio: '5.00',  categoriaInventario: 'reventa', receta: { insumo: 'Inca Kola 500ml',        cantidad: 1 } },
    { nombre: 'Coca Cola 500ml',        precio: '5.00',  categoriaInventario: 'reventa', receta: { insumo: 'Coca Cola 500ml',        cantidad: 1 } },
    { nombre: 'Sprite 500ml',           precio: '5.00',  categoriaInventario: 'reventa', receta: { insumo: 'Sprite 500ml',           cantidad: 1 } },
    { nombre: 'Inca Kola 1.5L',         precio: '12.00', categoriaInventario: 'reventa', receta: { insumo: 'Inca Kola 1.5L',         cantidad: 1 } },
    { nombre: 'Coca Cola 1.5L',         precio: '12.00', categoriaInventario: 'reventa', receta: { insumo: 'Coca Cola 1.5L',         cantidad: 1 } },
    { nombre: 'Agua San Luis 500ml',    precio: '3.00',  categoriaInventario: 'reventa', receta: { insumo: 'Agua San Luis 500ml',    cantidad: 1 } },
    { nombre: 'Cerveza Cusqueña 620ml', precio: '12.00', categoriaInventario: 'reventa', receta: { insumo: 'Cerveza Cusqueña 620ml', cantidad: 1 } },
    { nombre: 'Cerveza Pilsen 620ml',   precio: '10.00', categoriaInventario: 'reventa', receta: { insumo: 'Cerveza Pilsen 620ml',   cantidad: 1 } },

    // Multi-insumo (disponibilidad manual — no se auto-sincroniza)
    { nombre: 'Lomo saltado',           precio: '35.00', categoriaInventario: 'multi_insumo' },
    { nombre: 'Arroz chaufa',           precio: '30.00', categoriaInventario: 'multi_insumo' },
    { nombre: 'Tallarin saltado',       precio: '30.00', categoriaInventario: 'multi_insumo' },
    { nombre: 'Parrilla familiar',      precio: '90.00', categoriaInventario: 'multi_insumo' },
    { nombre: 'Ensalada de la casa',    precio: '15.00', categoriaInventario: 'multi_insumo' },
    { nombre: 'Porción de papas fritas',precio: '10.00', categoriaInventario: 'multi_insumo' },
  ];

  for (const p of platos) {
    const [existing] = await db.select().from(schema.platoCarta).where(eq(schema.platoCarta.nombre, p.nombre));
    if (existing) {
      console.log(`✓ Plato ya existe: ${p.nombre}`);
      continue;
    }
    const [plato] = await db.insert(schema.platoCarta).values({
      nombre: p.nombre,
      precio: p.precio,
      categoriaInventario: p.categoriaInventario,
    }).returning();
    console.log(`✓ Plato creado: ${p.nombre} — S/${p.precio}`);

    if (p.receta) {
      const insumo = insumoMap[p.receta.insumo];
      if (insumo) {
        await db.insert(schema.recetaPlato).values({
          platoCartaId: plato.id,
          insumoId: insumo.id,
          cantidadConsumida: p.receta.cantidad,
        });
        console.log(`  └─ Receta: ${p.receta.cantidad}x ${p.receta.insumo}`);
      }
    }
  }

  // ─── Auto-sync disponible según stock del insumo ──────────────────────────
  // Regla: si el insumo principal de la receta tiene stockActual = 0
  //        → marcar el plato como disponible = false automáticamente.
  // Solo aplica a fraccionable y reventa (los que tienen receta con insumo rastreable).
  // multi_insumo queda siempre en disponible = true (control manual).

  console.log('\n→ Sincronizando disponibilidad por stock…');

  const todosLosPlatos = await db.select().from(schema.platoCarta).where(eq(schema.platoCarta.activo, true));
  const todasLasRecetas = await db.select().from(schema.recetaPlato);
  const todosLosInsumos = await db.select().from(schema.insumo);

  const insumoStockMap = new Map(todosLosInsumos.map((i) => [i.id, i.stockActual ?? 0]));

  // Agrupar recetas por plato (tomamos el primer insumo de la receta como referencia)
  const recetaPorPlato = new Map<string, string>(); // platoId → insumoId
  for (const r of todasLasRecetas) {
    if (!recetaPorPlato.has(r.platoCartaId)) {
      recetaPorPlato.set(r.platoCartaId, r.insumoId);
    }
  }

  let sinStock = 0;
  let conStock = 0;

  for (const plato of todosLosPlatos) {
    if (plato.categoriaInventario === 'multi_insumo') continue;

    const insumoId = recetaPorPlato.get(plato.id);
    if (!insumoId) continue;

    const stock = insumoStockMap.get(insumoId) ?? 0;
    const debeEstarDisponible = stock > 0;

    if (plato.disponible !== debeEstarDisponible) {
      await db.update(schema.platoCarta)
        .set({ disponible: debeEstarDisponible })
        .where(eq(schema.platoCarta.id, plato.id));
      const estado = debeEstarDisponible ? 'disponible ✓' : 'sin stock ✗';
      console.log(`  ${estado}: ${plato.nombre} (stock insumo: ${stock})`);
    }

    debeEstarDisponible ? conStock++ : sinStock++;
  }

  console.log(`  → ${conStock} disponibles, ${sinStock} sin stock`);

  // ─── Mesas ────────────────────────────────────────────────────────────────

  const totalMesas = 10;
  const [existingMesa] = await db.select().from(schema.mesa).limit(1);
  if (existingMesa) {
    console.log(`\n✓ Mesas ya existen (${totalMesas} esperadas)`);
  } else {
    for (let i = 1; i <= totalMesas; i++) {
      await db.insert(schema.mesa).values({ numero: i, capacidad: 4 });
    }
    console.log(`\n✓ ${totalMesas} mesas creadas`);
  }

  await pool.end();
  console.log('\n✓ Seed de catálogo completado');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
