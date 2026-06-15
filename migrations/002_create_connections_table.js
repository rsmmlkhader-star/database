exports.up = function(knex) {
  return knex.schema.createTable('connections', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.enum('type', ['mysql', 'postgresql', 'sqlserver']).notNullable();
    table.string('host', 255).notNullable();
    table.integer('port').notNullable();
    table.string('database', 255).notNullable();
    table.text('config_encrypted').notNullable(); // Encrypted credentials
    table.boolean('is_encrypted').defaultTo(true);
    table.timestamp('last_synced_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index('user_id');
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('connections');
};
