exports.up = function(knex) {
  return knex.schema.createTable('row_mappings', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('connection_id').notNullable().references('id').inTable('connections').onDelete('CASCADE');
    table.string('table_name', 255).notNullable();
    table.string('row_id', 255).notNullable();
    table.string('sheet_row_number', 50);
    table.jsonb('db_primary_key'); // Can be composite
    table.timestamp('last_synced_at');
    table.enum('sync_status', ['synced', 'pending', 'error']).defaultTo('pending');
    table.integer('version').defaultTo(1);
    table.string('last_modified_by', 255);
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['connection_id', 'table_name', 'row_id']);
    table.index('connection_id');
    table.index('table_name');
    table.index('sync_status');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('row_mappings');
};
