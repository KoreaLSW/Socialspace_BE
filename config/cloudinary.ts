import { v2 as cloudinary } from "cloudinary";
import { log } from "../utils/logger";

// Cloudinary 설정
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// 이미지 업로드 함수
export const uploadImage = async (
  file: Express.Multer.File,
  folder: string = "socialspace/posts"
): Promise<{ url: string; public_id: string }> => {
  try {
    // Cloudinary 설정 확인
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      console.error("🔴 Cloudinary 환경 변수가 설정되지 않았습니다.");
      throw new Error("Cloudinary 설정이 누락되었습니다.");
    }

    console.log("🔍 Cloudinary 업로드 설정:", {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY ? "설정됨" : "누락",
      api_secret: process.env.CLOUDINARY_API_SECRET ? "설정됨" : "누락",
      fileSize: file.size,
      mimeType: file.mimetype,
    });

    // Base64 데이터 URL 형식으로 변환
    const base64Data = `data:${file.mimetype};base64,${file.buffer.toString(
      "base64"
    )}`;

    const result = await cloudinary.uploader.upload(base64Data, {
      resource_type: "image",
      folder: folder,
      format: "jpg",
      quality: "auto",
      fetch_format: "auto",
      transformation: [
        {
          width: 1080,
          height: 1080,
          crop: "limit",
          quality: "auto:good",
        },
      ],
    });

    console.log("✅ Cloudinary 업로드 성공:", {
      public_id: result.public_id,
      url: result.secure_url,
    });

    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    console.error("🔴 Cloudinary 업로드 상세 오류:", error);
    log("ERROR", "이미지 업로드 실패", error);
    throw new Error(
      `이미지 업로드에 실패했습니다: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

// Base64 이미지 업로드 함수
export const uploadBase64Image = async (
  base64Data: string,
  folder: string = "socialspace/posts"
): Promise<{ url: string; public_id: string }> => {
  try {
    const result = await cloudinary.uploader.upload(base64Data, {
      resource_type: "image",
      folder: folder,
      format: "jpg",
      quality: "auto",
      fetch_format: "auto",
      transformation: [
        {
          width: 1080,
          height: 1080,
          crop: "limit",
          quality: "auto:good",
        },
      ],
    });

    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    log("ERROR", "Base64 이미지 업로드 실패", error);
    throw new Error("이미지 업로드에 실패했습니다.");
  }
};

// 다중 이미지 업로드 함수
export const uploadMultipleImages = async (
  files: Express.Multer.File[],
  folder: string = "socialspace/posts"
): Promise<{ url: string; public_id: string }[]> => {
  try {
    const uploadPromises = files.map((file) => uploadImage(file, folder));
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    log("ERROR", "다중 이미지 업로드 실패", error);
    throw new Error("이미지 업로드에 실패했습니다.");
  }
};

// 이미지 삭제 함수
export const deleteImage = async (publicId: string): Promise<boolean> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === "ok";
  } catch (error) {
    log("ERROR", "이미지 삭제 실패", error);
    return false;
  }
};

// 다중 이미지 삭제 함수
export const deleteMultipleImages = async (
  publicIds: string[]
): Promise<boolean> => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds);
    return result.deleted && Object.keys(result.deleted).length > 0;
  } catch (error) {
    log("ERROR", "다중 이미지 삭제 실패", error);
    return false;
  }
};

// 이미지 URL 변환 함수 (크기 조정)
export const transformImageUrl = (
  url: string,
  options: {
    width?: number;
    height?: number;
    crop?: string;
    quality?: string;
  } = {}
): string => {
  try {
    const {
      width = 400,
      height = 400,
      crop = "fill",
      quality = "auto",
    } = options;

    // Cloudinary URL에서 public_id 추출
    const publicId = url.split("/").pop()?.split(".")[0];
    if (!publicId) return url;

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const transformedUrl = `https://res.cloudinary.com/${cloudName}/image/upload/w_${width},h_${height},c_${crop},q_${quality}/${publicId}.jpg`;

    return transformedUrl;
  } catch (error) {
    log("ERROR", "이미지 URL 변환 실패", error);
    return url;
  }
};

// 썸네일 생성 함수
export const generateThumbnail = (url: string): string => {
  return transformImageUrl(url, {
    width: 300,
    height: 300,
    crop: "fill",
    quality: "auto:good",
  });
};

// 프로필 이미지 업로드 함수 (users 폴더에 저장)
export const uploadProfileImage = async (
  file: Express.Multer.File,
  userId: string
) => {
  try {
    // Cloudinary 설정 확인
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      console.error("🔴 Cloudinary 환경 변수가 설정되지 않았습니다.");
      throw new Error("Cloudinary 설정이 누락되었습니다.");
    }

    console.log("🔍 프로필 이미지 업로드 설정:", {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY ? "설정됨" : "누락",
      api_secret: process.env.CLOUDINARY_API_SECRET ? "설정됨" : "누락",
      userId,
      fileSize: file.size,
      mimeType: file.mimetype,
    });

    // Base64 데이터 URL 형식으로 변환
    const base64Data = `data:${file.mimetype};base64,${file.buffer.toString(
      "base64"
    )}`;

    // users 폴더 안에 사용자 ID 폴더를 만들어 저장
    const folder = `socialspace/users/${userId}`;

    const result = await cloudinary.uploader.upload(base64Data, {
      resource_type: "image",
      folder: folder,
      // PNG로 저장하여 투명 배경 유지
      format: "png",
      quality: "auto",
      fetch_format: "auto",
    });

    console.log("✅ 프로필 이미지 업로드 성공:", {
      public_id: result.public_id,
      url: result.secure_url,
      folder,
    });

    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    console.error("🔴 프로필 이미지 업로드 상세 오류:", error);
    log("ERROR", "프로필 이미지 업로드 실패", error);
    throw new Error(
      `프로필 이미지 업로드에 실패했습니다: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

// Base64 프로필 이미지 업로드 함수
export const uploadBase64ProfileImage = async (
  base64Data: string,
  userId: string
) => {
  try {
    // users 폴더 안에 사용자 ID 폴더를 만들어 저장
    const folder = `socialspace/users/${userId}`;

    const result = await cloudinary.uploader.upload(base64Data, {
      resource_type: "image",
      folder: folder,
      // PNG로 저장하여 투명 배경 유지
      format: "png",
      quality: "auto",
      fetch_format: "auto",
    });

    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    log("ERROR", "Base64 프로필 이미지 업로드 실패", error);
    throw new Error("프로필 이미지 업로드에 실패했습니다.");
  }
};

export default cloudinary;
