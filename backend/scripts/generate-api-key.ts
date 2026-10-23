// manual escape hatch for minting a key without going through the http
// api - mainly useful for local testing and for handing someone a key
// before there's a dashboard to generate one from.
//
// usage: npm run mcp:generate-key -- <email> [scopes] [label]
//   scopes defaults to every available scope, comma-separated to narrow it
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiKeysService } from '../src/auth/api-keys.service';
import { AVAILABLE_SCOPES } from '../src/auth/dto/create-api-key.dto';

const prisma = new PrismaService();

async function main() {
  const [email, scopesArg, label] = process.argv.slice(2);
  if (!email) {
    console.error('usage: npm run mcp:generate-key -- <email> [scopes] [label]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`no user with email ${email}`);
    process.exit(1);
  }

  const scopes = scopesArg ? scopesArg.split(',') : [...AVAILABLE_SCOPES];
  const apiKeys = new ApiKeysService(prisma);
  const key = await apiKeys.create(user.id, { scopes, label: label ?? 'generated via cli' });

  console.log(`\n${key.rawKey}\n`);
  console.log(`scopes: ${key.scopes.join(', ')}`);
  console.log('this is the only time the raw key is shown - save it now.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
