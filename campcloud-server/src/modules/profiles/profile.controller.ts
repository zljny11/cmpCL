import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../types/auth-user';
import { ProfilesService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUser) {
    return this.profilesService.getProfile(BigInt(user.id));
  }

  @Put()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profilesService.updateProfile(BigInt(user.id), dto);
  }
}
