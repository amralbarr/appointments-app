import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// slots are public reads, booking create/cancel/lookup don't require an
// account either — see docs/API.md for which routes this actually sits on.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
