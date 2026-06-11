import { UserRole } from '../../domain/enums';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  wallet?: string;
}
