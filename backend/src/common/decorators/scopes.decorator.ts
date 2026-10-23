import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'scopes';

// required scopes for a route, checked by ScopesGuard against whatever
// the auth guard put on req.user.scopes. a human (password/jwt) caller
// always carries ['*'] and passes any check — scoping only bites for api
// keys, which is the whole point of letting a user mint a narrower one.
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
