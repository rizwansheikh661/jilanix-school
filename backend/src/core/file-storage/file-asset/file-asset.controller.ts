import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Readable } from 'node:stream';

import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { FileStoragePermissions } from '../file-storage.constants';
import {
  AclGrantResponseDto,
  FileAssetListQueryDto,
  FileAssetListResponseDto,
  FileAssetResponseDto,
  FileDownloadUrlResponseDto,
  GrantAclDto,
  UploadFileMetadataDto,
} from './file-asset.dto';
import { FileAssetService } from './file-asset.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Uploads')
@ApiBearerAuth('access-token')
@Controller({ path: 'uploads', version: '1' })
export class FileAssetController {
  constructor(private readonly service: FileAssetService) {}

  @Post()
  @RequirePermissions(FileStoragePermissions.CREATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        purpose: { type: 'string', example: 'STUDENT_PHOTO' },
        isPublic: { type: 'boolean', default: false },
      },
      required: ['file', 'purpose'],
    },
  })
  @ApiOkResponse({ type: FileAssetResponseDto })
  public async upload(
    @UploadedFile() file: MulterFile,
    @Body() body: UploadFileMetadataDto,
  ): Promise<FileAssetResponseDto> {
    const row = await this.service.upload({
      purpose: body.purpose,
      fileName: file.originalname,
      mimeType: file.mimetype,
      body: file.buffer,
      ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
    });
    return FileAssetResponseDto.from(row);
  }

  @Get()
  @RequirePermissions(FileStoragePermissions.READ)
  @ApiOkResponse({ type: FileAssetListResponseDto })
  public async list(@Query() query: FileAssetListQueryDto): Promise<FileAssetListResponseDto> {
    const result = await this.service.list({
      ...(query.purpose !== undefined ? { purpose: query.purpose } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
    return {
      items: result.items.map(FileAssetResponseDto.from),
      nextCursor: result.nextCursor,
    };
  }

  @Get(':id')
  @RequirePermissions(FileStoragePermissions.READ)
  @ApiOkResponse({ type: FileAssetResponseDto })
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FileAssetResponseDto> {
    const row = await this.service.getById(id);
    return FileAssetResponseDto.from(row);
  }

  @Get(':id/download-url')
  @RequirePermissions(FileStoragePermissions.DOWNLOAD)
  @ApiOkResponse({ type: FileDownloadUrlResponseDto })
  public async downloadUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<FileDownloadUrlResponseDto> {
    return this.service.buildDownloadUrl(id);
  }

  @Get(':id/download')
  @RequirePermissions(FileStoragePermissions.DOWNLOAD)
  public async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { row, stream } = await this.service.streamForDownload(id);
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${row.fileName}"`);
    res.setHeader('X-Schoolos-Checksum-Sha256', row.checksumSha256);
    const readable = stream instanceof Readable ? stream : Readable.from(stream);
    readable.pipe(res);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FileStoragePermissions.DELETE)
  public async delete(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.softDelete(id);
  }

  @Delete(':id/purge')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FileStoragePermissions.PURGE)
  public async purge(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.purge(id);
  }

  @Get(':id/acl-grants')
  @RequirePermissions(FileStoragePermissions.ACL_READ)
  public async listAcl(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ items: AclGrantResponseDto[] }> {
    const rows = await this.service.listAcl(id);
    return { items: rows.map(AclGrantResponseDto.from) };
  }

  @Post(':id/acl-grants')
  @RequirePermissions(FileStoragePermissions.ACL_GRANT)
  public async grantAcl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: GrantAclDto,
  ): Promise<AclGrantResponseDto> {
    const row = await this.service.grantAcl({
      fileAssetId: id,
      principalType: body.principalType,
      principalId: body.principalId ?? null,
    });
    return AclGrantResponseDto.from(row);
  }

  @Delete(':id/acl-grants/:grantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FileStoragePermissions.ACL_REVOKE)
  public async revokeAcl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('grantId', new ParseUUIDPipe()) grantId: string,
  ): Promise<void> {
    await this.service.revokeAcl(id, grantId);
  }
}
