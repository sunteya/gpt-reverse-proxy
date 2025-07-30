from typing import Any, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    litellm_config_path: str = "litellm_config.yaml"

    local_ollama_secret: str = "ollama"
    local_auth_token: Optional[str] = None

    @field_validator("local_ollama_secret", mode="before")
    @classmethod
    def empty_str_as_default(cls, v: Any) -> Any:
        if v == "":
            return cls.model_fields["local_ollama_secret"].default
        return v

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding='utf-8',
        case_sensitive=False,
        extra='ignore'
    )


settings = Settings()
