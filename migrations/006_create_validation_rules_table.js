exports.up = function(knex) {
  return knex.schema.createTable('validation_rules', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('connection_id').notNullable().references('id').inTable('connections').onDelete('CASCADE');
    table.string('table_name', 255).notNullable();
    table.string('field_name', 255).notNullable();
    table.enum('data_type', ['string', 'number', 'date', 'boolean', 'enum']).notNullable();
    table.boolean('required').defaultTo(true);
    table.integer('min_length');
    table.integer('max_length');
    table.string('pattern', 500); // Regex pattern
    table.jsonb('allowed_values'); // For enum type
    table.text('error_message');
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['connection_id', 'table_name', 'field_name']);
    table.index('connection_id');
    table.index('table_name');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('validation_rules');
};
