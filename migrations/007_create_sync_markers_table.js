exports.up = function(knex) {
  return knex.schema.createTable('sync_markers', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('connection_id').notNullable().references('id').inTable('connections').onDelete('CASCADE');
    table.string('table_name', 255).notNullable();
    table.timestamp('last_synced_at');
    table.integer('last_synced_row_count').defaultTo(0);
    table.string('last_sync_id', 255);
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['connection_id', 'table_name']);
    table.index('connection_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('sync_markers');
};
