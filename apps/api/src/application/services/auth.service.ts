import { BadRequestException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { verifyMessage } from 'ethers';
import { PAWN_REPOSITORY } from '../../common/tokens';
import { KycStatus, UserRole } from '../../domain/enums';
import { User, Wallet } from '../../domain/models';
import { PawnRepository } from '../ports/pawn-repository';

@Injectable()
export class AuthService {
  private readonly nonceTtlMs = 5 * 60 * 1000;
  private readonly nonces = new Map<string, { message: string; expiresAt: number }>();

  constructor(
    @Inject(PAWN_REPOSITORY) private readonly repository: PawnRepository,
    private readonly jwtService: JwtService
  ) {}

  createNonce(walletAddress: string): { walletAddress: string; nonce: string } {
    const normalized = walletAddress.toLowerCase();
    const nonce = randomUUID();
    const issuedAt = new Date().toISOString();
    const message = [
      'Sign in to PawnShop Protocol',
      `Wallet: ${normalized}`,
      `Issued at: ${issuedAt}`,
      `Nonce: ${nonce}`,
      'Only sign this message on the local demo application.'
    ].join('\n');
    this.nonces.set(normalized, { message, expiresAt: Date.now() + this.nonceTtlMs });
    return { walletAddress, nonce: message };
  }

  async login(walletAddress: string, chainId: number, signature: string): Promise<{ accessToken: string; user: User }> {
    const normalized = walletAddress.toLowerCase();
    const challenge = this.nonces.get(normalized);
    if (!challenge || challenge.expiresAt < Date.now()) {
      this.nonces.delete(normalized);
      throw new UnauthorizedException('Invalid wallet signature challenge');
    }

    let recoveredAddress = '';
    try {
      recoveredAddress = verifyMessage(challenge.message, signature).toLowerCase();
    } catch {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    if (recoveredAddress !== normalized) {
      throw new UnauthorizedException('Wallet signature does not match requested address');
    }

    let user = await this.repository.findUserByWallet(normalized);
    if (!user) {
      user = await this.repository.saveUser({
        id: randomUUID(),
        displayName: `Customer ${normalized.slice(0, 6)}`,
        role: UserRole.Customer,
        kycStatus: KycStatus.NotStarted,
        createdAt: new Date()
      });

      const wallet: Wallet = {
        id: randomUUID(),
        userId: user.id,
        address: normalized,
        chainId,
        verifiedAt: new Date()
      };
      await this.repository.saveWallet(wallet);
    }

    this.nonces.delete(normalized);
    const accessToken = await this.jwtService.signAsync({ sub: user.id, role: user.role, wallet: normalized });
    return { accessToken, user };
  }

  async demoLogin(role: UserRole, userIdOption?: string, passwordOption?: string, walletAddress?: string): Promise<{
    userId: string;
    displayName: string;
    role: UserRole;
    walletAddress?: string;
    token: string;
  }> {
    this.ensureDemoMode();

    if (process.env.NODE_ENV !== 'test') {
      if (!passwordOption || passwordOption !== 'workspace-password') {
        throw new UnauthorizedException('Invalid workspace password');
      }
    }

    // Resolve userId — fall back to role defaults only when not explicitly provided
    const userId = userIdOption || (role === UserRole.Customer ? 'customer-1' : role === UserRole.Staff ? 'staff-1' : 'admin-1');

    // Look up the user record directly by ID (wallet address is no longer hardcoded per account)
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException(`User account "${userId}" not found in database`);
    }

    if (user.role !== role) {
      throw new UnauthorizedException(`Role mismatch: Account "${userId}" is registered as "${user.role}", not "${role}"`);
    }

    // Normalize the wallet address sent by the frontend (may be undefined if not connected)
    const normalizedWallet = walletAddress ? walletAddress.toLowerCase() : undefined;

    if (normalizedWallet) {
      let wallet = await this.repository.findWalletByUserId(user.id);
      if (wallet) {
        wallet.address = normalizedWallet;
        wallet.verifiedAt = new Date();
        await this.repository.saveWallet(wallet);
      } else {
        wallet = {
          id: randomUUID(),
          userId: user.id,
          address: normalizedWallet,
          chainId: 1, // Default chainId
          verifiedAt: new Date()
        };
        await this.repository.saveWallet(wallet);
      }
    }

    let finalWalletAddress = normalizedWallet;
    if (!finalWalletAddress && process.env.BLOCKCHAIN_MODE === 'anvil') {
      const existingWallet = await this.repository.findWalletByUserId(user.id);
      if (existingWallet) {
        finalWalletAddress = existingWallet.address;
      }
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      ...(finalWalletAddress ? { wallet: finalWalletAddress } : {})
    });

    return {
      userId: user.id,
      displayName: user.displayName,
      role: user.role,
      walletAddress: finalWalletAddress,
      token
    };
  }

  private ensureDemoMode(): void {
    const demoEnabled = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'test';
    if (process.env.NODE_ENV === 'production' || !demoEnabled) {
      throw new ForbiddenException('Demo login is disabled. Set DEMO_MODE=true for local demonstrations.');
    }
  }
}
