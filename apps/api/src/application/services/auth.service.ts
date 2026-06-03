import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PAWN_REPOSITORY } from '../../common/tokens';
import { KycStatus, UserRole } from '../../domain/enums';
import { User, Wallet } from '../../domain/models';
import { PawnRepository } from '../ports/pawn-repository';

@Injectable()
export class AuthService {
  private readonly nonces = new Map<string, string>();

  constructor(
    @Inject(PAWN_REPOSITORY) private readonly repository: PawnRepository,
    private readonly jwtService: JwtService
  ) {}

  createNonce(walletAddress: string): { walletAddress: string; nonce: string } {
    const nonce = `Sign in to PawnShop at ${new Date().toISOString()} with nonce ${randomUUID()}`;
    this.nonces.set(walletAddress.toLowerCase(), nonce);
    return { walletAddress, nonce };
  }

  async login(walletAddress: string, chainId: number, signature: string): Promise<{ accessToken: string; user: User }> {
    const normalized = walletAddress.toLowerCase();
    const nonce = this.nonces.get(normalized);
    if (!nonce || signature.length < 8) {
      throw new UnauthorizedException('Invalid wallet signature challenge');
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

  async demoLogin(role: UserRole): Promise<{
    userId: string;
    displayName: string;
    role: UserRole;
    walletAddress?: string;
    token: string;
  }> {
    let walletAddress = '';
    if (role === UserRole.Customer) {
      walletAddress = '0x1111111111111111111111111111111111111111';
    } else if (role === UserRole.Staff) {
      walletAddress = '0x2222222222222222222222222222222222222222';
    } else if (role === UserRole.Admin) {
      walletAddress = '0x3333333333333333333333333333333333333333';
    } else {
      throw new UnauthorizedException(`Invalid role: ${role}`);
    }

    const user = await this.repository.findUserByWallet(walletAddress);
    if (!user) {
      throw new UnauthorizedException(`Seed user for role ${role} not found`);
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      wallet: walletAddress
    });

    return {
      userId: user.id,
      displayName: user.displayName,
      role: user.role,
      walletAddress,
      token
    };
  }
}

