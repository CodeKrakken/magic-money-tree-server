
const { MongoClient } = require('mongodb');

async function setupDB() {

  const uri = "mongodb+srv://CodeKrakken:bt91vnNkgGApOfCj@cluster0.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";
  const client = new MongoClient(uri) // , { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    await listDatabases(client)



  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

setupDB().catch(console.error)

async function listDatabases(client) {
  const databasesList = await client.db().admin().listDatabases();
  console.log('Databases:')
  databasesList.databases.forEach(database => {
    console.log(database.name)
  })
  
}